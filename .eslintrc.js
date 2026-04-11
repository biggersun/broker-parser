module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/typescript',
  ],
  rules: {
    // 禁止引用 DB 相关包（确保零数据库依赖）
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['prisma', '@prisma/client'],
            message: 'broker-parser 不能依赖 Prisma',
          },
          {
            group: ['pg', 'pg-*'],
            message: 'broker-parser 不能依赖 PostgreSQL 客户端',
          },
          {
            group: ['sequelize', 'typeorm'],
            message: 'broker-parser 不能依赖 ORM',
          },
        ],
      },
    ],
    // 禁止 any（零类型逃逸）
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
    // 禁止未使用变量
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    // import 顺序
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
      },
    ],
  },
  overrides: [
    {
      // CLI 入口允许 console（命令行输出需要）
      files: ['src/cli/**/*.ts'],
      rules: {
        'no-console': 'off',
      },
    },
    {
      // 其他 src 代码禁止 console（统一用可选 logger）
      files: ['src/core/**/*.ts', 'src/parsers/**/*.ts', 'src/types/**/*.ts'],
      rules: {
        'no-console': ['error', { allow: ['warn', 'error'] }],
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'jest.config.js'],
};
