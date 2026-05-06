import { type AuthProxyEnv, handleAuthProxyRequest } from "./handler";

export default {
  fetch(request: Request, env: AuthProxyEnv): Promise<Response> {
    return handleAuthProxyRequest(request, env, {
      fetch: (input, init) => fetch(input, init),
    });
  },
} satisfies ExportedHandler<AuthProxyEnv>;
