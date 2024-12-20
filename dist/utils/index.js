"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.cleanupDirs = exports.copyToBin = exports.extractToLib = exports.downloadFlywaySource = exports.getReleaseSource = undefined;

var _os = require("os");

var _os2 = _interopRequireDefault(_os);

var _fsExtra = require("fs-extra");

var _fsExtra2 = _interopRequireDefault(_fsExtra);

var _path = require("path");

var _path2 = _interopRequireDefault(_path);

var _progress = require("progress");

var _progress2 = _interopRequireDefault(_progress);

var _extractZip = require("extract-zip");

var _extractZip2 = _interopRequireDefault(_extractZip);

var _child_process = require("child_process");

var _filesize = require("filesize");

var _axios = require("axios");

var _axios2 = _interopRequireDefault(_axios);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const env = process.env;

const repoBaseUrl = "https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline";

const readDotFlywayFile = () => {
  let resolveDotFlywayPath = _fsExtra2.default.existsSync(_path2.default.resolve(__dirname, "../../../../../", ".flyway")) ? _path2.default.resolve(__dirname, "../../../../../", ".flyway") : "";
  // console.log("readDotFlywayFile dotFlywayPath -> ", resolveDotFlywayPath);
  let encoding = "utf8";

  var version = resolveDotFlywayPath !== "" ? _fsExtra2.default.readFileSync(resolveDotFlywayPath, { encoding }) : "";

  version !== "" ? console.log("Found version in .flyway -> ", version) : "";
  return version.trim();
};

/**
 * @returns sources[os.platform()]
 */
const getReleaseSource = exports.getReleaseSource = () => _axios2.default.get(`${repoBaseUrl}/maven-metadata.xml`).then(response => {
  let releaseRegularExp = new RegExp("<release>(.+)</release>");
  let releaseVersion = readDotFlywayFile() || response.data.match(releaseRegularExp)[1];

  // console.log("getReleaseSource releaseVersion -> ", releaseVersion);
  let sources = {
    win32: {
      url: `${repoBaseUrl}/${releaseVersion}/flyway-commandline-${releaseVersion}-windows-x64.zip`,
      filename: `flyway-commandline-${releaseVersion}-windows-x64.zip`,
      folder: `flyway-${releaseVersion}`
    },
    linux: {
      url: `${repoBaseUrl}/${releaseVersion}/flyway-commandline-${releaseVersion}-linux-x64.tar.gz`,
      filename: `flyway-commandline-${releaseVersion}-linux-x64.tar.gz`,
      folder: `flyway-${releaseVersion}`
    },
    arm64: {
      url: `${repoBaseUrl}/${releaseVersion}/flyway-commandline-${releaseVersion}-macosx-arm64.tar.gz`,
      filename: `flyway-commandline-${releaseVersion}-macosx-arm64.tar.gz`,
      folder: `flyway-${releaseVersion}`
    },
    darwin: {
      url: `${repoBaseUrl}/${releaseVersion}/flyway-commandline-${releaseVersion}-macosx-x64.tar.gz`,
      filename: `flyway-commandline-${releaseVersion}-macosx-x64.tar.gz`,
      folder: `flyway-${releaseVersion}`
    }
  };

  // Apple Silicon version was released with 9.6.0
  if (_os2.default.platform() === "darwin" && _os2.default.arch() === "arm64") {
    const [majorVersion, minorVersion] = releaseVersion.split(".");
    if (Number(majorVersion) > 9 || Number(majorVersion) === 9 && Number(minorVersion) >= 6) {
      return sources.arm64;
    }
  }

  return sources[_os2.default.platform()];
});

// copied from https://github.com/getsentry/sentry-cli/blob/c65df4fba17101e60e8c31f378f6001b514e5a42/scripts/install.js#L123-L131
const getNpmCache = () => {
  return env.npm_config_cache || env.npm_config_cache_folder || env.npm_config_yarn_offline_mirror || (env.APPDATA ? _path2.default.join(env.APPDATA, 'npm-cache') : _path2.default.join(_os2.default.homedir(), '.npm'));
};

/**
 * @param {any} source
 * @returns source.filename
 */
const downloadFlywaySource = exports.downloadFlywaySource = source => {
  let downloadDir = _path2.default.join(getNpmCache(), 'flywaydb-cli');

  if (!source) {
    throw new Error("Your platform is not supported");
  }

  source.filename = _path2.default.join(downloadDir, source.filename);
  if (_fsExtra2.default.existsSync(source.filename)) {
    console.log("Cached file exists, skipping download", source.filename);
    return Promise.resolve(source.filename);
  } else if (!_fsExtra2.default.existsSync(downloadDir)) {
    _fsExtra2.default.mkdirSync(downloadDir);
  }

  console.log("Downloading", source.url);
  console.log("Saving to", source.filename);

  return new Promise((resolve, reject) => {
    let proxyUrl = env.npm_config_https_proxy || env.npm_config_http_proxy || env.npm_config_proxy;

    const progressBar = new _progress2.default("  [:bar] :percent :etas", {
      width: 40,
      total: 0 // Initial total set to 0; will update on first progress event
    });

    // axios by default enforces strict SSL validation
    // axios by default automatically follows redirect
    (0, _axios2.default)({
      method: 'get',
      url: source.url,
      // ensures the response is returned as a stream
      responseType: 'stream',
      proxy: proxyUrl ? {
        host: new URL(proxyUrl).hostname,
        port: new URL(proxyUrl).port
      } : false,
      headers: {
        'User-Agent': env.npm_config_user_agent || 'axios'
      }
    }).then(response => {
      // set total on first progress event
      const totalLength = response.headers['content-length'];

      if (totalLength) {
        progressBar.total = parseInt(totalLength, 10);
      }

      // write downloaded file data to disk
      const writer = _fsExtra2.default.createWriteStream(source.filename);
      response.data.on('data', chunk => {
        // update progress bar based on how much data we have transferred so far
        progressBar.tick(chunk.length);
      });
      response.data.pipe(writer);

      writer.on('finish', () => {
        console.log(`\nReceived ${(0, _filesize.filesize)(totalLength)} total.`);
        resolve(source.filename);
      });

      writer.on('error', err => {
        console.error("Error writing file: ", err);
        reject(err);
      });
    }).catch(err => {
      console.error(`
        Error requesting source.
        URL: ${source.url}
        Proxy URL: ${proxyUrl || 'none'}
        Error: ${err.message}
        Make sure your network and proxy settings are correct.

        If you continue to have issues, please report this full log at https://github.com/sgraham/flywaydb-cli
      `);
      reject(err);
    });
  });
};

/**
 * @param {any} file
 * @returns extractDir
 */
const extractToLib = exports.extractToLib = file => {
  let extractDir = _path2.default.join(__dirname, "../../", "lib");

  if (!_fsExtra2.default.existsSync(extractDir)) {
    _fsExtra2.default.mkdirSync(extractDir);
  } else {
    _fsExtra2.default.removeSync(extractDir);
    _fsExtra2.default.mkdirSync(extractDir);
  }

  if (_path2.default.extname(file) === ".zip") {
    return new Promise((resolve, reject) => {
      (0, _extractZip2.default)(file, { dir: extractDir }, err => {
        if (err) {
          console.error("Error extracting zip", err);
          reject(new Error("Error extracting zip"));
        } else {
          resolve(extractDir);
        }
      });
    });
  } else {
    return new Promise((resolve, reject) => {
      (0, _child_process.spawn)("tar", ["zxf", file], {
        cwd: extractDir,
        stdio: "inherit"
      }).on("close", code => {
        if (code === 0) {
          resolve(extractDir);
        } else {
          console.log("Untaring file failed", code);
          reject(new Error("Untaring file failed"));
        }
      });
    });
  }
};

/**
 * @param {any} libDir
 * @returns
 */
const copyToBin = exports.copyToBin = libDir => {
  return new Promise((resolve, reject) => {
    let versionDirs = flywayVersionDir(libDir);
    let flywayDir = _path2.default.join(libDir, versionDirs[0]);
    let binDir = _path2.default.join(__dirname, "../../", "bin");

    if (_fsExtra2.default.existsSync(flywayDir)) {
      _fsExtra2.default.removeSync(binDir);
      _fsExtra2.default.copySync(flywayDir, binDir);

      resolve();
    } else {
      reject(new Error(`flywayDir was not found at ${flywayDir}`));
    }
  });
};

/**
 * @param {any} libDir
 */
const flywayVersionDir = libDir => {
  return _fsExtra2.default.readdirSync(libDir).filter(file => _fsExtra2.default.statSync(_path2.default.join(libDir, file)).isDirectory());
};

const cleanupDirs = exports.cleanupDirs = () => {
  _fsExtra2.default.removeSync(_path2.default.join(__dirname, "../../", "lib"));
};