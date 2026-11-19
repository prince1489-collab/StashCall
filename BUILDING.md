# Building StashCall for testers

Builds run on Expo's servers (EAS). You start them from your own computer once per platform, because Apple and Google sign-in and signing keys are set up interactively the first time.

## No Node.js on your computer? Use Codespaces

On the repo page click **Code**, then **Codespaces**, then **Create codespace on main**. You get a browser-based editor with a terminal and Node.js already installed. Run every command below in that terminal, skipping the clone step. When you're done, run `git commit -am "Link Expo project" && git push` to save the project ID that `init` adds.

## One-time setup

1. Install Node.js 20 or newer (not needed in Codespaces).
2. Clone the repo and install:
   ```bash
   git clone https://github.com/prince1489-collab/StashCall.git
   cd StashCall
   npm install
   ```
3. Sign in to Expo and link the project:
   ```bash
   npx eas-cli@latest login        # Expo account: prince1489
   npx eas-cli@latest init         # creates the StashCall project on expo.dev
   ```
   `init` adds a project ID to `app.json`. Commit that change.

## Android: shareable install link (about 15 minutes)

```bash
npx eas-cli@latest build --platform android --profile preview
```

Say **yes** when asked to generate a new Android keystore. When the build finishes, Expo shows a link and QR code. Testers open it on their Android phone and install the APK. No Play Store review is needed.

## iPhone: TestFlight (about 30 minutes, plus Apple's beta review)

```bash
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --latest
```

Sign in with your Apple Developer account when asked, and let EAS create the certificates and the App Store Connect app (bundle ID `com.stashcall.app`). After the upload is processed (10 to 30 minutes):

1. In App Store Connect, open StashCall, then TestFlight.
2. Add yourself under **Internal Testing** to install straight away.
3. For other testers, create an **External** group, add their emails, and submit the build for beta review. It usually takes under a day.

## Later builds

Run the same `build` command again. Version numbers go up automatically.
