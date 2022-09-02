import { getGlobalLogger, logException } from "./logger";
import { IReflection, isEqualType } from "./typeReflection";

const DEFAULT_CONFIG_PATH = "prod";
const DEFAULT_DEBUG_CONFIG_PATH = "dev";

export function readJSON<T>(filename: string, parser: any = null) {
  const fs = require("fs");

  let data = fs.readFileSync(filename).toString();

  // remove all comments
  data = data.replace(/((["'])(?:\\[\s\S]|.)*?\2|\/(?![*\/])(?:\\.|\[(?:\\.|.)\]|.)*?\/)|\/\/.*?$|\/\*[\s\S]*?\*\//gm, "$1");

  // remove trailing commas
  data = data.replace(/\,(?!\s*?[\{\[\"\'\w])/g, "");

  //console.log( data );

  const res = JSON.parse(data, parser) as T;

  return res;
}

function readConfigBase<T extends IReflection<T>>(project: string, type: string, mode: string = undefined, userPath: string = undefined, obj: T = null): T {
  let path = `./configs/`;

  if (userPath && userPath !== "") {
    path = userPath;
  } else {
    if (mode) {
      path += `${mode}/`;
    } else if (process.env.CONFIG_PATH) {
      path += `${process.env.CONFIG_PATH}/`;
      getGlobalLogger().debug2(`configuration env.CONFIG_PATH using ^w^K${process.env.CONFIG_PATH}^^`);
    } else {
      const modePath = process.env.NODE_ENV === "development" ? DEFAULT_DEBUG_CONFIG_PATH : DEFAULT_CONFIG_PATH;
      path += `${modePath}/`;
      getGlobalLogger().warning(`configuration path not set. using ^w^K${modePath}^^`);
    }
  }

  path += `${project}-${type}.json`;

  try {
    const res = readJSON<T>(path);

    const valid = isEqualType(obj.instanciate(), res);

    if (valid) {
      getGlobalLogger().info(`^g^W ${project} ^^ ^Gconfiguration ^K^w${path}^^ loaded`);
    } else {
      getGlobalLogger().error2(` ${project}  configuration ^K^w${path}^^ has errors`);
    }

    return res;
  } catch (error) {
    logException(error, `${type} file ^K^w${path}^^ load error`);
  }
}

export function readConfig<T extends IReflection<T>>(obj: T, project: string, mode: string = undefined, userPath: string = undefined): T {
  return readConfigBase<T>(project, "config", mode, userPath, obj);
}

export function readCredentials<T extends IReflection<T>>(obj: T, project: string, mode: string = undefined, userPath: string = undefined): T {
  return readConfigBase<T>(project, "credentials", mode, userPath, obj);
}
