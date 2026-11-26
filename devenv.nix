{ pkgs, inputs, ... }:
let
  agents = import inputs.agents { inherit pkgs; };
in
{
  languages.javascript = {
    enable = true;
    nodejs.enable = true;
    npm.enable = true;
  };

  languages.typescript.enable = true;

  packages = [agents.pi];
}
