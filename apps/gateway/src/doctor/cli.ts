import { confirm } from "@inquirer/prompts";
import { loadResolvedProfile } from "../tui/profile.js";
import { renderDoctorReport, runDoctor } from "./engine.js";

interface DoctorCliArgs {
  profile?: string;
  gateway?: string;
  rootDir?: string;
  auditOnly: boolean;
  noRepair: boolean;
  deep: boolean;
  yes: boolean;
  json: boolean;
  readOnly: boolean;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const resolvedProfile = await loadResolvedProfile({
    profileName: args.profile,
    gatewayOverride: args.gateway,
  });

  const report = await runDoctor({
    rootDir: args.rootDir,
    gatewayBaseUrl: args.gateway ?? resolvedProfile.profile.gatewayBaseUrl,
    profileName: resolvedProfile.profileName,
    profilePath: resolvedProfile.filePath,
    deep: args.deep,
    auditOnly: args.auditOnly,
    noRepair: args.noRepair,
    yes: args.yes,
    readOnly: args.readOnly,
    authToken: resolvedProfile.auth.token,
    authMode: resolvedProfile.auth.mode,
    tokenQueryParam: resolvedProfile.profile.tokenQueryParam,
    promptConfirm: async (message: string) =>
      confirm({
        message,
        default: false,
      }),
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderDoctorReport(report));
  }
  process.exitCode = report.summary.exitCode;
}

function parseArgs(argv: string[]): DoctorCliArgs {
  const args: DoctorCliArgs = {
    auditOnly: false,
    noRepair: false,
    deep: false,
    yes: false,
    json: false,
    readOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--profile") {
      args.profile = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--gateway") {
      args.gateway = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--root" || value === "--root-dir") {
      args.rootDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--audit-only") {
      args.auditOnly = true;
      continue;
    }
    if (value === "--no-repair") {
      args.noRepair = true;
      continue;
    }
    if (value === "--deep") {
      args.deep = true;
      continue;
    }
    if (value === "--yes" || value === "-y") {
      args.yes = true;
      continue;
    }
    if (value === "--json") {
      args.json = true;
      continue;
    }
    if (value === "--read-only") {
      args.readOnly = true;
      continue;
    }
  }

  return args;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});

