import type { Server } from "socket.io";

let _io: Server | null = null;

export function setIo(io: Server): void {
  _io = io;
}

export function emitToFacility(facilityId: string, event: string, payload: unknown): void {
  _io?.to(`facility:${facilityId}`).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  _io?.to(`user:${userId}`).emit(event, payload);
}
