# esquery-cli

## Usage

```bash
npx esquery-cli <selector> [glob]

Queries files for a given AST selector based on `esquery`. Selector documentatio
n can be found at https://github.com/estools/esquery

Positionals:
  selector  CSS like                                                    [string]
  glob      Files to search. Note that files listed in the .gitignore in the cur
            rent working directory are ignored by default.
                              [string] [default: "**/*.{cjs,js,jsx,mjs,ts,tsx}"]

Options:
  --version            Show version number                             [boolean]
  --help               Show help                                       [boolean]
  --verbose            Logs additional information    [boolean] [default: false]
  --include-code-frame  Logs the codeframe of each query result.
                                                      [boolean] [default: false]

Examples:
  esquery-cli.js "TSAsExpression"
```
