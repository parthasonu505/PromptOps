import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { type Request, type Response, type NextFunction } from "express";
import { storage } from "./storage";
import { type User } from "@shared/schema";

const JWT_SECRET = process.env.JWT_SECRET || "promptops-dev-secret-key";
const JWT_EXPIRES_IN = "7d";

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export interface TokenPayload {
  userId: number;
  username: string;
  role: string;
}

export function generateToken(user: User): string {
  const payload: TokenPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  try {
    // Add user data to request
    const user = await storage.getUser(payload.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "User not found or inactive" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({ message: "Authentication error" });
  }
}

export function requireRole(roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient privileges" });
    }

    next();
  };
}

export async function loginUser(username: string, password: string): Promise<{ user: User; token: string } | null> {
  const user = await storage.getUserByUsername(username);
  
  if (!user || !user.isActive) {
    return null;
  }

  const isValid = await comparePassword(password, user.password);
  
  if (!isValid) {
    return null;
  }

  const token = generateToken(user);
  
  // Remove password from user object
  const { password: _, ...userWithoutPassword } = user;

  return {
    user: userWithoutPassword as User,
    token,
  };
}