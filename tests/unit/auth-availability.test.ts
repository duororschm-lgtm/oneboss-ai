import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {authenticate} from '../../src/lib/security/auth';
import {proxy} from '../../src/proxy';
const {getUser}=vi.hoisted(()=>({getUser:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser}})}));
const request=()=>new Request('http://localhost/api/core/admin',{headers:{Authorization:'Bearer test-access-token'}});
beforeEach(()=>{vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://auth.example');vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','public-test-key');getUser.mockReset();});
afterEach(()=>vi.unstubAllEnvs());
it('classifies authentication transport and upstream failures as retryable service errors',async()=>{
 for(const error of [{name:'AuthRetryableFetchError',status:0},{name:'AuthApiError',status:503}]){
 getUser.mockResolvedValue({data:{user:null},error});
 await expect(authenticate(request())).rejects.toMatchObject({code:'AUTH_SERVICE_UNAVAILABLE',status:503});
 }
});
it('still rejects invalid tokens and missing Authorization without granting local admin access',async()=>{
 await expect(authenticate(new Request('http://localhost/api/core/admin'))).rejects.toMatchObject({code:'UNAUTHENTICATED',status:401});
 expect(getUser).not.toHaveBeenCalled();
 getUser.mockResolvedValue({data:{user:null},error:{name:'AuthApiError',status:401}});
 await expect(authenticate(request())).rejects.toMatchObject({code:'UNAUTHENTICATED',status:401});
});
it('takes the actor only from the verified Auth user',async()=>{
 getUser.mockResolvedValue({data:{user:{id:'verified-user-id'}},error:null});
 expect(await authenticate(request())).toEqual({userId:'verified-user-id'});
 expect(getUser).toHaveBeenCalledWith('test-access-token');
});
it('permits React development debugging while retaining production CSP',()=>{
 vi.stubEnv('NODE_ENV','development');expect(proxy().headers.get('content-security-policy')).toContain("'unsafe-eval'");
 vi.stubEnv('NODE_ENV','production');const csp=proxy().headers.get('content-security-policy');
 expect(csp).not.toContain("'unsafe-eval'");expect(csp).toContain("frame-ancestors 'none'");
});
