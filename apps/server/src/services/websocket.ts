import type { ServerMessage } from "@laoda/shared";

export const clients = new Set<any>();

export function notifyClients(data: ServerMessage) {
  const message = JSON.stringify(data);
  for (const client of clients) {
    try {
      if (client.readyState === 1) {
        // 1 is OPEN in ws library
        client.send(message);
      }
    } catch {
      clients.delete(client);
    }
  }
}
