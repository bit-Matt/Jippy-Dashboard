import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";

export const db = drizzle(process.env.POSTGRES_URL!, { schema });
