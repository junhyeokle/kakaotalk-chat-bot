import * as readline from 'readline';
import * as os from 'os';
import {
  AuthApiClient,
  KnownAuthStatusCode,
  util,
} from 'node-kakao';
import {
  saveSession,
  loadSession,
  credentialToSession,
} from '../kakao/session';

function ask(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  if (hidden) {
    // Mask password input: mute the terminal echo while the user types.
    const asMutable = rl as unknown as { output: NodeJS.WriteStream; _writeToOutput?: (s: string) => void };
    (asMutable as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (
      stringToWrite: string,
    ) => {
      if (stringToWrite.includes(question)) {
        asMutable.output.write(stringToWrite);
      } else {
        asMutable.output.write('*');
      }
    };
  }

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  console.log('=== KakaoTalk bot login ===');
  console.log('This will log into a real KakaoTalk account and save a session file locally.\n');

  const email = await ask('KakaoTalk email: ');
  const password = await ask('KakaoTalk password: ', true);

  const deviceName = `${os.hostname()}-kakaobot`.slice(0, 32);
  // Reuse the device UUID from a prior session so we don't re-register the
  // device on every login; only generate a fresh one on first run.
  const existing = loadSession();
  const deviceUUID = existing?.deviceUUID ?? util.randomWin32DeviceUUID();

  const api = await AuthApiClient.create(deviceName, deviceUUID);
  const form = { email, password };

  let loginRes = await api.login(form);

  // A brand-new device must be registered via an emailed/SMS passcode before
  // login succeeds.
  if (!loginRes.success && loginRes.status === KnownAuthStatusCode.DEVICE_NOT_REGISTERED) {
    console.log('\nThis device is not registered. Requesting a passcode...');
    const passcodeReq = await api.requestPasscode(form);
    if (!passcodeReq.success) {
      throw new Error(`Failed to request passcode (status ${passcodeReq.status}).`);
    }

    const passcode = await ask('Enter the passcode sent to your account: ');
    const register = await api.registerDevice(form, passcode, true);
    if (!register.success) {
      throw new Error(`Device registration failed (status ${register.status}).`);
    }

    loginRes = await api.login(form);
  }

  if (!loginRes.success) {
    throw new Error(
      `Login failed (status ${loginRes.status}). ` +
        `Check your credentials, or the account may be restricted.`,
    );
  }

  saveSession(credentialToSession(loginRes.result, deviceName));

  console.log('\nLogin successful. Session saved to .kakao-session.json');
  console.log('You can now run "npm run dev" to start the bot.');
}

main().catch((err) => {
  console.error('\nLogin error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
