module.exports = {
  extends: ['stylelint-config-standard', 'stylelint-config-rational-order', 'stylelint-config-recommended-vue'],
  defaultSeverity: 'warning',
  plugins: ['stylelint-order'],
  overrides: [
    {
      files: ['**/*.less'],
      customSyntax: 'postcss-less',
    },
  ],
  rules: {
    'at-rule-no-unknown': [true, { ignoreAtRules: ['plugin'] }],
    'rule-empty-line-before': ['always', { except: ['after-single-line-comment', 'first-nested'] }],
    'selector-class-pattern': null,
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['deep'] }],
  },
};
