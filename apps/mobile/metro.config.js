const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const exclusionList =
  require("metro-config/private/defaults/exclusionList").default;

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

function resolvePackage(name) {
  return path.dirname(
    require.resolve(`${name}/package.json`, {
      paths: [projectRoot, workspaceRoot],
    }),
  );
}

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.disableHierarchicalLookup = true;
config.resolver.blockList = exclusionList([
  /apps[\/\\]web[\/\\]\.next[\/\\].*/,
  /apps[\/\\]web[\/\\]out[\/\\].*/,
  /apps[\/\\]api[\/\\]dist[\/\\].*/,
  /_emu[\/\\].*/,
]);
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.extraNodeModules = {
  react: resolvePackage("react"),
  "react-native": resolvePackage("react-native"),
  "react-native-web": resolvePackage("react-native-web"),
};

module.exports = config;
