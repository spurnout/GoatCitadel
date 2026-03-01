import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { loadLocalEnvFile } from "./env-file.js";
import { loadGatewayConfig } from "./config.js";
import { GatewayService } from "./services/gateway-service.js";

loadLocalEnvFile();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printUsage();
    return;
  }

  const [group, action, ...rest] = args;
  if (group !== "backup" && group !== "retention") {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const config = await loadGatewayConfig(resolveRootDir());
  const gateway = new GatewayService(config);
  await gateway.init();

  try {
    if (group === "backup") {
      await runBackupCommand(gateway, action, rest);
      return;
    }
    await runRetentionCommand(gateway, action, rest);
  } finally {
    await gateway.close();
  }
}

async function runBackupCommand(
  gateway: GatewayService,
  action: string | undefined,
  args: string[],
): Promise<void> {
  if (action === "create") {
    const name = readFlag(args, "--name");
    const outputPath = readFlag(args, "--output");
    const created = await gateway.createBackup({
      name: name ?? undefined,
      outputPath: outputPath ?? undefined,
    });
    console.log(JSON.stringify(created, null, 2));
    return;
  }

  if (action === "list") {
    const limitRaw = readFlag(args, "--limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
    const items = await gateway.listBackups(Number.isFinite(limit) ? limit : 50);
    console.log(JSON.stringify({ items }, null, 2));
    return;
  }

  if (action === "restore") {
    const filePath = readFlag(args, "--file");
    const confirm = args.includes("--confirm");
    if (!filePath) {
      throw new Error("Missing required --file <path>");
    }
    if (!confirm) {
      throw new Error("Restore requires --confirm");
    }
    const restored = await gateway.restoreBackup({
      filePath,
      confirm: true,
    });
    console.log(JSON.stringify(restored, null, 2));
    return;
  }

  throw new Error("Unknown backup command");
}

async function runRetentionCommand(
  gateway: GatewayService,
  action: string | undefined,
  args: string[],
): Promise<void> {
  if (action === "show") {
    console.log(JSON.stringify(gateway.getRetentionPolicy(), null, 2));
    return;
  }

  if (action === "set") {
    const realtimeDays = readFlag(args, "--realtime-days");
    const backupKeep = readFlag(args, "--backup-keep");
    const transcriptDays = readFlag(args, "--transcript-days");
    const auditDays = readFlag(args, "--audit-days");
    const updated = gateway.updateRetentionPolicy({
      realtimeEventsDays: realtimeDays ? Number.parseInt(realtimeDays, 10) : undefined,
      backupsKeep: backupKeep ? Number.parseInt(backupKeep, 10) : undefined,
      transcriptsDays: parseOptionalDays(transcriptDays),
      auditDays: parseOptionalDays(auditDays),
    });
    console.log(JSON.stringify(updated, null, 2));
    return;
  }

  if (action === "prune") {
    const apply = args.includes("--apply");
    const dryRun = !apply;
    const result = await gateway.pruneRetention({ dryRun });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error("Unknown retention command");
}

function parseOptionalDays(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  if (value.toLowerCase() === "off") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readFlag(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index < 0) {
    return null;
  }
  return args[index + 1] ?? null;
}

function resolveRootDir(): string {
  const envRoot = process.env.GOATCITADEL_ROOT_DIR?.trim();
  if (envRoot) {
    return path.resolve(envRoot);
  }

  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "config", "assistant.config.json"))) {
      return candidate;
    }
  }

  return path.resolve(process.cwd(), "../..");
}

function printUsage(): void {
  console.log(`Usage:
  gc admin backup create [--name <name>] [--output <path>]
  gc admin backup list [--limit <n>]
  gc admin backup restore --file <path> --confirm
  gc admin retention show
  gc admin retention set --realtime-days <n> --backup-keep <n> [--transcript-days <n>|off] [--audit-days <n>|off]
  gc admin retention prune [--dry-run|--apply]`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
