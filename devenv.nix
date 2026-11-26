{ pkgs, config, lib, inputs, ... }:
let
  agents = import inputs.agents { inherit pkgs; };
in
{
  packages = [agents.pi];
  languages = {
    javascript = {
      enable = true;
      nodejs.enable = true;
      npm.enable = true;
      npm.install.enable = true;
    };
    typescript.enable = true;
  };

  env.PATH = "$PATH:${lib.escapeShellArg config.devenv.root}";
}
