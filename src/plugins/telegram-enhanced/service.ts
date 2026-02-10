// @ts-expect-error - plugin package currently ships without type declarations
import { TelegramService } from "@elizaos/plugin-telegram";
import { EnhancedTelegramMessageManager } from "./message-manager.js";

export class TelegramEnhancedService extends (TelegramService as any) {
  static serviceType = (TelegramService as any).serviceType;

  static async start(runtime: any) {
    const service = (await (TelegramService as any).start(runtime)) as any;
    if (service?.bot) {
      service.messageManager = new (EnhancedTelegramMessageManager as any)(
        service.bot,
        runtime,
      );
    }
    return service;
  }

  static async stop(runtime: any) {
    return (TelegramService as any).stop(runtime);
  }

  constructor(runtime: any) {
    super(runtime);

    const self = this as any;
    if (self.bot) {
      self.messageManager = new (EnhancedTelegramMessageManager as any)(
        self.bot,
        runtime,
      );
    }
  }
}
