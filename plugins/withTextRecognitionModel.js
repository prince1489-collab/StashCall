// Ships Google ML Kit's text recognition model inside the app.
//
// expo-text-extractor uses the Play services version, which downloads the
// model the first time it's needed. On an APK installed outside the Play
// Store that download can take a while, and every read fails until it's
// done. The bundled library has the same API, so swap it in for every
// module. It adds a few MB to the app.
const { withProjectBuildGradle } = require('expo/config-plugins');

const MARKER = '// stashcall: bundled text recognition';
const SNIPPET = `
${MARKER}
allprojects {
  configurations.all {
    resolutionStrategy.dependencySubstitution {
      substitute module('com.google.android.gms:play-services-mlkit-text-recognition') using module('com.google.mlkit:text-recognition:16.0.1')
    }
  }
}
`;

module.exports = function withTextRecognitionModel(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) cfg.modResults.contents += SNIPPET;
    return cfg;
  });
};
