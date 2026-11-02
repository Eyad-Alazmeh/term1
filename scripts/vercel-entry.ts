import { handle } from "@hono/node-server/vercel";
import app from "../api/boot";

// نقطة دخول Vercel: build:vercel يجمّعها مع كل الكود الخلفي في ملف api/index.js
export default handle(app);
