import {record} from './contracts';

/** Never expose raw provider text: it can contain credentials or the pasted description. */
export class ModelRequestError extends Error {}
export function generationError(error:unknown, provider:string, model:string, stage:string):ModelRequestError {
  const r=record(error);
  const message=typeof r.message==='string'?r.message:typeof error==='string'?error:'';
  const candidate=r.status??r.statusCode??record(r.response).status
    ??message.match(/\b(?:HTTP(?:\s+error)?|API\s+error|status(?:\s+code)?)\s*[:=]?\s*([45]\d{2})\b/i)?.[1]
    ??message.match(/\bfailed\s*\(([45]\d{2})\):/i)?.[1];
  const status=/^[45]\d{2}$/.test(String(candidate))?Number(candidate):undefined;
  let code='REQUEST_FAILED',detail='Check this connection in Lumiverse and retry.';
  if(status===401||/unauthori|authentication|(?:invalid|incorrect|missing|expired).{0,30}(?:api.?key|credentials|token)/i.test(message)){code='AUTHENTICATION';detail='Check the API key saved in this Lumiverse connection.';}
  else if(status===402||/insufficient.*(?:balance|credit)|balance.*insufficient/i.test(message)){code='CREDIT_LIMIT';detail='Check the provider account balance.';}
  else if(status===403){code='ACCESS_DENIED';detail='The provider denied access to this request.';}
  else if(status===429||/rate.limit|quota/i.test(message)){code='RATE_LIMIT';detail='Wait before retrying or check the provider quota.';}
  else if(/model.{0,80}(?:not found|not available|does not exist|invalid|unknown|required|missing|empty)|(?:unknown|invalid|missing)\s+model/i.test(message)){code='MODEL_UNAVAILABLE';detail='Re-select the model in this Lumiverse connection.';}
  else if(status===400||status===422||/unsupported.*parameter|invalid.*request/i.test(message)){code='INVALID_REQUEST';detail='The provider rejected the request settings. Share this code and the selected model.';}
  else if(/timeout|timed?\s*out/i.test(message)||r.name==='TimeoutError'){code='TIMEOUT';detail='The provider took too long to respond. Try again with a shorter description.';}
  else if(/fetch failed|network|ECONN|ENOTFOUND|connection refused|socket.*closed/i.test(message)){code='CONNECTION_FAILED';detail='Lumiverse could not reach the provider.';}
  else if(status&&status>=500){code='PROVIDER_UNAVAILABLE';detail='The provider reported a server error. Try again later.';}
  const safe=(name:string)=>/^[a-zA-Z0-9_.\/-]{1,150}$/.test(name)?name:'selected connection';
  return new ModelRequestError(`LumiCast model request failed during ${stage} (${safe(provider)} / ${safe(model)}; ${code}${status?`; HTTP ${status}`:''}). ${detail} Your edits are preserved.`);
}
