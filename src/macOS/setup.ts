import { platform, release } from "os";
import { macOSRecord } from "@guidepup/record";
import chalk from "chalk";
import { checkVersion } from "./checkVersion";
import { enableAppleScriptControlSystemDefaults } from "./enableAppleScriptControlSystemDefaults";
import { disableSplashScreenSystemDefaults } from "./disableSplashScreenSystemDefaults";
import { disableDictationInputAutoEnable } from "./disableDictationInputAutoEnable";
import { isSipEnabled } from "./isSipEnabled";
import { writeDatabaseFile } from "./writeDatabaseFile";
import {
  SYSTEM_PATH,
  USER_PATH,
  updateTccDb,
  getAllOsaScriptEntries,
} from "./updateTccDb";
import { isAppleScriptControlEnabled } from "./isAppleScriptControlEnabled";
import { handleInfo, handleWarning, logInfo } from "../logging";
import { ERR_MACOS_REQUIRES_MANUAL_USER_INTERACTION } from "../errors";
import { enableDoNotDisturb } from "./enableDoNotDisturb";
import { enabledDbFile } from "./isAppleScriptControlEnabled/enabledDbFile";

const isCi = process.argv.includes("--ci");
const ignoreTccDb = process.argv.includes("--ignore-tcc-db");
const isRecorded = process.argv.includes("--record");

export async function setup(): Promise<void> {
  handleInfo(`👀 Check if SIP is enabled: ${isSipEnabled()}`);

  if (!ignoreTccDb) {
    try {
      handleInfo("🆙 Update TCC.db for USER_PATH");
      updateTccDb(USER_PATH);

      handleInfo("🤔 Check if OSA script post event is written for USER_PATH");
      const osaScripts = getAllOsaScriptEntries(USER_PATH);
      const isOsaScriptPostEventAvailable = osaScripts.includes(
        "kTCCServicePostEvent|/usr/bin/osascript",
      );
      if (isOsaScriptPostEventAvailable) {
        handleInfo("✅ OSA script post event is available");
      } else {
        handleWarning("❌ OSA script post event is not available", osaScripts);
      }
      handleInfo(osaScripts);
    } catch (e) {
      if (isCi) {
        throw e;
      }
    }

    try {
      handleInfo("🆙 Update TCC.db for SYSTEM_PATH");
      updateTccDb(SYSTEM_PATH);
    } catch {
      // Swallow error - most CI don't allow system configuration
      handleWarning(
        "❌ Update failed TCC.db for SYSTEM_PATH",
        "--- most CI don't allow system configuration",
      );
    }
  } else {
    handleWarning(
      "Ignoring TCC.db updates",
      "If the necessary permissions have not been granted by other means, using this flag may result in your environment not being set up for reliable screen reader automation.",
    );
  }

  const osName = platform();
  const osVersion = release();

  const stopRecording = isRecorded
    ? macOSRecord(
        `./recordings/macos-guidepup-setup-${osName}-${osVersion}-${+new Date()}.mov`,
      )
    : () => null;

  try {
    handleInfo("🆚 Checking macOS version");
    checkVersion();
    handleInfo("🕛 Enabling AppleScript control system defaults");
    enableAppleScriptControlSystemDefaults();
    handleInfo("🕐 Disabling splash screen system defaults");
    disableSplashScreenSystemDefaults();
    handleInfo("🕑 Disabling dictation input auto-enable");
    disableDictationInputAutoEnable();

    if (isCi) {
      handleInfo("🤫 Enabling Do Not Disturb mode");
      await enableDoNotDisturb();
    }

    if (!isSipEnabled() && !(await enabledDbFile())) {
      writeDatabaseFile();

      return;
    }

    if (await isAppleScriptControlEnabled()) {
      return;
    }

    if (isCi) {
      throw new Error(ERR_MACOS_REQUIRES_MANUAL_USER_INTERACTION);
    }

    logInfo(
      "Please complete remaining setup by following this guide:\n\n--> " +
        chalk.underline(
          chalk.bold(
            "https://www.guidepup.dev/docs/guides/manual-voiceover-setup",
          ),
        ),
    );
  } finally {
    stopRecording();
  }
}
