export default {
  fetch(): Response {
    return new Response("auth-proxy: not implemented yet\n", {
      status: 501,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
} satisfies ExportedHandler;
