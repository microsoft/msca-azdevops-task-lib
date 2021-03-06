"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const process = __importStar(require("process"));
const tl = __importStar(require("azure-pipelines-task-lib/task"));
class MscaInstaller {
    install(cliVersion) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('Installing Microsoft Security Code Analysis Cli...');
            if (process.env.MSCA_FILEPATH) {
                console.log(`MSCA CLI File Path overriden by %MSCA_FILEPATH%: ${process.env.MSCA_FILEPATH}`);
                return;
            }
            if (process.env.MSCA_DIRECTORY) {
                console.log(`MSCA CLI Directory overriden by %MSCA_DIRECTORY%: ${process.env.MSCA_DIRECTORY}`);
                let mscaFilePath = path.join(process.env.MSCA_DIRECTORY, 'guardian');
                tl.debug(`mscaFilePath = ${mscaFilePath}`);
                process.env.MSCA_FILEPATH = mscaFilePath;
                return;
            }
            let mscaDirectory = path.join(process.env.AGENT_ROOTDIRECTORY, '_msca');
            tl.debug(`mscaDirectory = ${mscaDirectory}`);
            this.ensureDirectory(mscaDirectory);
            let mscaPackagesDirectory = path.join(mscaDirectory, 'versions');
            tl.debug(`mscaPackagesDirectory = ${mscaPackagesDirectory}`);
            this.ensureDirectory(mscaPackagesDirectory);
            let mscaVersionsDirectory = path.join(mscaPackagesDirectory, 'microsoft.security.codeanalysis.cli');
            tl.debug(`mscaVersionsDirectory = ${mscaVersionsDirectory}`);
            if (this.isInstalled(mscaVersionsDirectory, cliVersion)) {
                return;
            }
            let failed = false;
            let attempts = 0;
            let maxAttempts = 2;
            do {
                try {
                    failed = false;
                    const mscaTaskLibDirectory = path.resolve(__dirname);
                    tl.debug(`mscaTaskLibDirectory = ${mscaTaskLibDirectory}`);
                    const mscaProjectFile = path.join(mscaTaskLibDirectory, 'msca-task-lib.proj');
                    tl.debug(`mscaProjectFile = ${mscaProjectFile}`);
                    let tool = tl.tool('dotnet')
                        .arg('restore')
                        .arg(mscaProjectFile)
                        .arg(`/p:MscaPackageVersion=${cliVersion}`)
                        .arg('--packages')
                        .arg(mscaPackagesDirectory)
                        .arg('--source')
                        .arg('https://api.nuget.org/v3/index.json');
                    yield tool.exec();
                }
                catch (error) {
                    tl.debug(error);
                    failed = true;
                    attempts += 1;
                    if (attempts > maxAttempts) {
                        break;
                    }
                }
            } while (failed);
            this.resolvePackageDirectory(mscaVersionsDirectory, cliVersion);
        });
    }
    ensureDirectory(directory) {
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory);
        }
    }
    isInstalled(versionsDirectory, cliVersion) {
        let installed = false;
        if (cliVersion.includes("*")) {
            tl.debug(`MSCA CLI version contains a latest quantifier: ${cliVersion}. Continuing with install...`);
            return installed;
        }
        this.setVariablesWithVersion(versionsDirectory, cliVersion);
        if (fs.existsSync(process.env.MSCA_DIRECTORY)) {
            console.log(`MSCA CLI v${cliVersion} already installed.`);
            installed = true;
        }
        return installed;
    }
    resolvePackageDirectory(versionDirectory, cliVersion) {
        if (cliVersion.includes("*")) {
            let packageDirectory = this.findLatestVersionDirectory(versionDirectory);
            this.setVariables(packageDirectory);
        }
        else {
            this.setVariablesWithVersion(versionDirectory, cliVersion);
        }
        if (!fs.existsSync(process.env.MSCA_DIRECTORY)) {
            throw `MSCA CLI v${cliVersion} was not found after installation.`;
        }
    }
    findLatestVersionDirectory(versionsDirectory, isPreRelease = false) {
        let latestDirectory = null;
        let latestVersionParts = null;
        let latestIsPreRelease = false;
        let latestPreReleaseFlag = null;
        tl.debug(`Searching for all version folders in: ${versionsDirectory}`);
        let dirs = this.getDirectories(versionsDirectory);
        for (let dirIndex = 0; dirIndex < dirs.length; dirIndex++) {
            let dir = dirs[dirIndex];
            if (dir == null || dir == "") {
                tl.debug(`Skipping null or empty directory: ${dir}`);
                continue;
            }
            tl.debug(`Evaluating MSCA directory: ${dir}`);
            const dirRegex = new RegExp(/^(\d+\.?){1,6}(\-\w+)?$/g);
            if (dirRegex.exec(dir) == null) {
                tl.debug(`Skipping invalid version directory: ${dir}`);
                continue;
            }
            let fullVersionParts = dir.split("-");
            if (fullVersionParts == null || fullVersionParts.length < 0 || fullVersionParts.length > 2) {
                tl.debug(`Skipping invalid version directory: ${dir}`);
            }
            let dirIsPreRelease = fullVersionParts.length > 1;
            if (!isPreRelease && dirIsPreRelease) {
                tl.debug(`Skipping pre-release version directory: ${dir}`);
                continue;
            }
            let dirPreReleaseFlag = null;
            if (dirIsPreRelease) {
                dirPreReleaseFlag = fullVersionParts[1];
            }
            let versionNumbersString = fullVersionParts[0];
            let versionParts = dir.split(".");
            let isLatest = latestDirectory == null;
            if (!isLatest) {
                let maxVersionParts = versionParts.length;
                if (latestVersionParts.length > maxVersionParts) {
                    maxVersionParts = latestVersionParts.length;
                }
                for (let versionPartIndex = 0; versionPartIndex < versionParts.length; versionPartIndex++) {
                    let versionPart = 0;
                    let latestVersionPart = 0;
                    let isLastVersionPart = versionPartIndex == (maxVersionParts - 1);
                    if (versionPartIndex < versionParts.length) {
                        versionPart = parseInt(versionParts[versionPartIndex]);
                    }
                    if (versionPartIndex < latestVersionParts.length) {
                        latestVersionPart = parseInt(latestVersionParts[versionPartIndex]);
                    }
                    if (versionPart > latestVersionPart) {
                        isLatest = true;
                    }
                    else if (versionPart == latestVersionPart) {
                        isLatest = isLastVersionPart
                            &&
                                ((isPreRelease && latestIsPreRelease && dirPreReleaseFlag > latestPreReleaseFlag)
                                    ||
                                        (!isPreRelease && latestIsPreRelease));
                    }
                    else {
                        break;
                    }
                    if (isLatest) {
                        break;
                    }
                }
            }
            if (isLatest) {
                tl.debug(`Setting latest version directory: ${dir}`);
                latestDirectory = path.join(versionsDirectory, dir);
                latestVersionParts = versionParts;
                latestIsPreRelease = dirIsPreRelease;
                latestPreReleaseFlag = dirPreReleaseFlag;
            }
        }
        tl.debug(`latestDirectory = ${latestDirectory}`);
        return latestDirectory;
    }
    getDirectories(directory) {
        return fs.readdirSync(directory).filter(p => this.isDirectory(directory, p));
    }
    isDirectory(directory, p) {
        return fs.statSync(path.join(directory, p)).isDirectory();
    }
    setVariablesWithVersion(versionDirectory, cliVersion) {
        let packageDirectory = path.join(versionDirectory, cliVersion);
        tl.debug(`packageDirectory = ${packageDirectory}`);
        this.setVariables(packageDirectory);
    }
    setVariables(packageDirectory) {
        let mscaDirectory = path.join(packageDirectory, 'tools');
        tl.debug(`mscaDirectory = ${mscaDirectory}`);
        let mscaFilePath = path.join(mscaDirectory, 'guardian');
        tl.debug(`mscaFilePath = ${mscaFilePath}`);
        process.env.MSCA_DIRECTORY = mscaDirectory;
        process.env.MSCA_FILEPATH = mscaFilePath;
    }
}
exports.MscaInstaller = MscaInstaller;
