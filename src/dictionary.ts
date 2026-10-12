import { isCupSizeTag, record, tagName, type TagDictionary, type VerifiedTag } from './contracts';

export interface HttpResponse { status: number; body: string }
export type HttpGet = (url: string) => Promise<HttpResponse>;
interface Cached { expires: number; value: unknown }
const DAN = 'https://danbooru.donmai.us';
const GEL = 'https://gelbooru.com/index.php';

/** One fixed lookup that says what Gelbooru does with these credentials. Never returns the reply body, the key or the ID. */
export async function testGelbooru(http: HttpGet, credentials: {user: string; key: string}): Promise<{ok: boolean; message: string}> {
  if (!credentials.user || !credentials.key) return {ok:false, message:'Enter your Gelbooru user ID and API key first.'};
  if (!/^\d+$/.test(credentials.user)) return {ok:false, message:'The Gelbooru user ID must be the number from your account page, not your username.'};
  const url = new URL(GEL);
  Object.entries({page:'dapi', s:'tag', q:'index', json:'1', limit:'1', name:'blue_eyes', user_id:credentials.user, api_key:credentials.key}).forEach(([k, v]) => url.searchParams.set(k, v));
  let response: HttpResponse; let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    response = await Promise.race([http(url.toString()), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 12_000); })]).finally(() => clearTimeout(timer));
  } catch (error) {
    return {ok:false, message: error instanceof Error && error.message === 'timeout' ? 'Gelbooru did not answer within 12 seconds.' : 'The request never reached Gelbooru. This is the Lumiverse server’s network or its CORS proxy, not your credentials.'};
  }
  const body = typeof response.body === 'string' ? response.body : '';
  // A page title is the most telling safe detail of a non-JSON reply ("Just a moment..." is bot protection).
  const title = (/<title[^>]*>([^<]{1,80})/i.exec(body)?.[1] ?? '').replace(/\s+/g, ' ').trim().split(credentials.key).join('…').split(credentials.user).join('…');
  const shown = title ? ` The page it returned is titled “${title}”.` : '';
  if (response.status === 401) return {ok:false, message:`Gelbooru rejected these credentials (HTTP 401). Check that the user ID is the number and the API key is the long string from Gelbooru → My Account → Options → API Access Credentials.${shown}`};
  if (response.status === 403) return {ok:false, message:`Gelbooru refused the request (HTTP 403) before checking your key. That is usually bot protection against requests from a server, so new credentials will not help.${shown}`};
  if (response.status === 429) return {ok:false, message:'Gelbooru says too many requests (HTTP 429). Wait a minute and test again.'};
  if (response.status !== 200) return {ok:false, message:`Gelbooru answered HTTP ${Number(response.status) || 'unknown'}.${shown}`};
  let value: unknown;
  try { value = JSON.parse(body); } catch { return {ok:false, message:`Gelbooru answered HTTP 200 but not with tag data${body.trim() ? '' : ' (the reply was empty)'}.${shown} An empty or non-JSON reply usually means the credentials were not accepted.`}; }
  const rows = Array.isArray(value) ? value : Array.isArray(record(value).tag) ? record(value).tag as unknown[] : [];
  const hit = rows.map(record).find(r => r.name === 'blue_eyes');
  if (hit) return {ok:true, message:`Gelbooru accepted these credentials and returned blue_eyes (${Number(hit.count ?? hit.post_count) || 0} posts).`};
  return {ok:false, message:`Gelbooru answered HTTP 200 with JSON, but without the tag that was asked for (top-level fields: ${Object.keys(record(value)).slice(0, 6).join(', ') || 'none'}). LumiCast may not understand its current reply format.`};
}

/** Only fixed public metadata endpoints, never post/image searches or user-supplied URLs. */
export class BooruDictionary implements TagDictionary {
  private cache = new Map<string, Cached>();
  private queue: Promise<unknown> = Promise.resolve();
  private nextAt = 0;
  private unavailable = new Map<string,number>();
  readonly notices = new Set<string>();
  constructor(private http: HttpGet, private credentials: {user: string; key: string} = {user:'',key:''}, private spacingMs = 450) {}

  private async request(base: string, query: Record<string,string>, signal: AbortSignal): Promise<unknown> {
    const url = new URL(base);
    if ((this.unavailable.get(url.hostname) ?? 0) > Date.now()) throw new Error('Tag service temporarily unavailable.');
    Object.entries(query).forEach(([k,v]) => url.searchParams.set(k,v));
    // Cache keys never contain credentials. Credentials are fixed for this dictionary instance.
    const key = url.toString(); const saved = this.cache.get(key);
    if (saved && saved.expires > Date.now()) return saved.value;
    const task = this.queue.catch(() => {}).then(async () => {
      signal.throwIfAborted();
      const hit = this.cache.get(key);
      if (hit && hit.expires > Date.now()) return hit.value;
      await new Promise(resolve => setTimeout(resolve, Math.max(0, this.nextAt - Date.now())));
      signal.throwIfAborted(); this.nextAt = Date.now() + this.spacingMs;
      if (url.hostname === 'gelbooru.com') {
        url.searchParams.set('user_id', this.credentials.user);
        url.searchParams.set('api_key', this.credentials.key);
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      // Spindle's CORS RPC has no AbortSignal input. Bound our wait; the host bounds its own request.
      const response = await Promise.race([
        this.http(url.toString()),
        new Promise<never>((_,reject) => {timer = setTimeout(() => reject(new Error('Tag lookup timed out.')), 12_000);}),
      ]).finally(() => clearTimeout(timer));
      signal.throwIfAborted();
      if (response.status !== 200) {
        this.unavailable.set(url.hostname,Date.now()+30_000);
        // The status is the only safe detail to surface, and the one that tells a bad key from a blocked request.
        if(url.hostname==='gelbooru.com')this.notices.add(`Gelbooru lookup failed (HTTP ${Number(response.status)||'unknown'}: ${response.status===401?'it rejected the user ID or API key':response.status===403?'it refused the request, which is usually bot protection and not your key':response.status===429?'too many requests':'service problem'}). Danbooru spellings are used where available.`);
        throw new Error('Tag service unavailable or authentication required.');
      }
      if (response.body.length > 500_000) throw new Error('Oversized tag response.');
      let value: unknown;
      try { value = JSON.parse(response.body); } catch { throw new Error('Invalid tag service response.'); }
      if (!Array.isArray(value) && !('tag' in record(value)) && !('@attributes' in record(value))) throw new Error('Unexpected tag service response.');
      // Public metadata only, capped memory; failures never poison the cache.
      if (this.cache.size >= 512) this.cache.delete(this.cache.keys().next().value!);
      const empty = Array.isArray(value) && value.length === 0;
      this.cache.set(key, {value, expires:Date.now() + (empty ? 3_600_000 : 7*86_400_000)});
      return value;
    });
    this.queue = task;
    return task;
  }
  private dan(path: string, query: Record<string,string>, signal: AbortSignal) { return this.request(`${DAN}/${path}.json`, {limit:'20',...query}, signal); }
  private gel(name: string, signal: AbortSignal) {
    return this.request(GEL, {page:'dapi',s:'tag',q:'index',json:'1',limit:'20',name}, signal);
  }
  private valid(row: unknown, source: 'Danbooru'|'Gelbooru'): VerifiedTag | null {
    const r = record(row);
    if (typeof r.name !== 'string' || (r.is_deprecated === true) || (source === 'Gelbooru' && Number(r.ambiguous) === 1)) return null;
    const category = Number(r.category ?? r.type);
    // Exclude artist, copyright, character and deprecated categories from automatic translation.
    if (![0,5].includes(category)) return null;
    const count = Number(r.post_count ?? r.count);
    if (!Number.isFinite(count) || count < 1) return null;
    let name: string; try {name=tagName(r.name);} catch {return null;}
    if (isCupSizeTag(name)) return null;
    return {name,source,count,wiki:'',url:source === 'Danbooru' ? `${DAN}/wiki_pages/${encodeURIComponent(name)}` : `https://gelbooru.com/index.php?page=wiki&s=list&search=${encodeURIComponent(name)}`};
  }
  async resolve(raw: string, signal: AbortSignal): Promise<VerifiedTag | null> {
    if (isCupSizeTag(tagName(raw))) return null;
    const requested = tagName(raw); let canonical = requested;
    const live = async (name: string) => {
      const rows = await this.dan('tags', {'search[name]':name}, signal);
      return (Array.isArray(rows) ? rows : []).map(r => this.valid(r,'Danbooru')).find(r => r?.name === name) ?? null;
    };
    // A live tag is already canonical, so the alias table is consulted only on a miss.
    let result = await live(requested);
    if (!result) {
      const visited = new Set<string>();
      for (let hop=0;hop<4;hop++) {
        if (visited.has(canonical)) throw new Error('Cyclic tag alias.');
        visited.add(canonical);
        const aliases = await this.dan('tag_aliases', {'search[antecedent_name]':canonical,'search[status]':'active'}, signal);
        const alias = (Array.isArray(aliases) ? aliases : []).map(record).find(r => r.antecedent_name === canonical && r.status === 'active');
        if (!alias) break;
        canonical = tagName(alias.consequent_name);
        if (hop === 3) throw new Error('Tag alias chain too long.');
      }
      if (canonical !== requested) result = await live(canonical);
    }
    if (result) {
      try {
        const wikis = await this.dan('wiki_pages', {'search[title]':canonical}, signal);
        const wiki = (Array.isArray(wikis) ? wikis : []).map(record).find(r => r.title === canonical && r.is_deleted !== true);
        result.wiki = typeof wiki?.body === 'string' ? wiki.body.slice(0,4000) : '';
      } catch { signal.throwIfAborted(); }
      if (requested !== canonical) result.aliasFrom = requested;
    }
    if (this.credentials.user && this.credentials.key) {
      // A Danbooru alias establishes equivalence before trying the Gelbooru spelling.
      for (const name of [...new Set([requested,canonical])]) {
        try {
          const data = await this.gel(name,signal); const r=record(data);
          const rows = Array.isArray(data) ? data : Array.isArray(r.tag) ? r.tag : [];
          const gel = rows.map(r=>this.valid(r,'Gelbooru')).find(r=>r?.name===name);
          if (gel && (name === canonical || result?.aliasFrom === requested)) return {...gel,wiki:result?.wiki ?? '',...(requested!==gel.name ? {aliasFrom:requested} : {})};
        } catch {signal.throwIfAborted();}
      }
    }
    return result;
  }
  async search(query: string, signal: AbortSignal): Promise<VerifiedTag[]> {
    const name = tagName(query);
    const rows = await this.dan('tags', {'search[name_matches]':`${name}*`,'search[order]':'count'},signal);
    return (Array.isArray(rows) ? rows : []).map(r=>this.valid(r,'Danbooru')).filter((r):r is VerifiedTag => !!r);
  }
}
