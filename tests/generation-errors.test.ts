import {test,expect} from 'bun:test';
import {generationError} from '../src/generation-errors';
test('provider failures emit fixed useful categories, never upstream secrets or source text',()=> {
  for(const [raw,code] of [
    ['API error 400: invalid request SECRET','INVALID_REQUEST'],
    ['API error 401: key SECRET','AUTHENTICATION'],
    ['Request failed (402): balance SECRET','CREDIT_LIMIT'],
    ['HTTP 429 SECRET','RATE_LIMIT'],
    ['HTTP 503 SECRET','PROVIDER_UNAVAILABLE'],
    ['Invalid model SECRET','MODEL_UNAVAILABLE'],
    ['fetch failed SECRET','CONNECTION_FAILED'],
    ['timed out SECRET','TIMEOUT'],
    ['pasted private source text SECRET','REQUEST_FAILED'],
  ]){
    const error=generationError(new Error(raw),'deepseek','deepseek-v4-pro','tag meaning review');
    expect(error.message).toContain(code);expect(error.message).toContain('tag meaning review');expect(error.message).toContain('deepseek-v4-pro');expect(error.message).not.toContain('SECRET');expect(error.message).not.toContain('private source');
  }
});
