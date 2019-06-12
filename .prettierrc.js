
module.exports = {
  overrides: [
    {
      files: "*.js",
      options: {
        arrowParens: "always",
        bracketSpacing: true,
        printWidth: 120,
        parser: "flow",
        quoteProps: "as-needed",
        semi: true,
        singleQuote: true,
        tabs: false,
        tabWidth: 2,
        trailingComma: "es5",
      },
    },
    {
      files: "*.json",
      options: {
        parser: "json",
      },
    },
  ],
};