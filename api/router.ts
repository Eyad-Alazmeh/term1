import { createRouter, publicQuery } from "./middleware";
import { hrRouter } from "./routers/hr";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  hr: hrRouter,
});

export type AppRouter = typeof appRouter;
