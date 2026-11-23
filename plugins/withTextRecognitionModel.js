// Ships Google ML Kit's text recognition model inside the app.
//
// expo-text-extractor uses the Play services version, which downloads the
// model the first time it's needed. On an APK installed outside the Play
// Store that download can take a while, and every read fails until it's
// done. The bundled library has the same API (com.google.mlkit.vision.text),
// so the app drops the Play services one and ships the bundled one. It adds
// a few MB to the app.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// stashcall: bundled text recognition';
const SNIPPET = `
${MARKER}
configurations.all {
  exclude group: 'com.google.android.gms', module: 'play-services-mlkit-text-recognition'
}
dependencies {
  implementation 'com.google.mlkit:text-recognition:16.0.1'
}
`;

module.exports = function withTextRecognitionModel(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) cfg.modResults.contents += SNIPPET;
    return cfg;
  });
};
