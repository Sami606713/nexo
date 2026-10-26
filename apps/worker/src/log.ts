import pino from "pino";

export const log = pino({
  name: "postline-worker",
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
});

export type Logger = typeof log;
