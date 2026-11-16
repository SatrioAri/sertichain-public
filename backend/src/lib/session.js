import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

const ISSUER = "sertichain-backend";
const AUDIENCE = "sertichain-frontend";

export function signSession(wallet) {
  return jwt.sign({}, config.JWT_SECRET, {
    algorithm: "HS256",
    subject: wallet.toLowerCase(),
    expiresIn: config.JWT_EXPIRES_IN,
    issuer: ISSUER,
    audience: AUDIENCE,
    jwtid: randomUUID(),
  });
}

export function verifySession(token) {
  return jwt.verify(token, config.JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}
