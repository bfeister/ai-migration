/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import storybook from 'eslint-plugin-storybook';

// TODO: generator should generate a working eslint config
const baseConfig = await import('../../eslint.config.js');

export default [
    ...baseConfig.default,
    {
        // Ignore Storybook config files from linting (they have their own TS project context)
        // Also ignore other things to minimize memory issues
        ignores: [
            '.storybook/**/*',
            'build/**/*',
            'coverage/**/*',
            'storybook-static/**/*',
            '_local/**/*',
            '**/__snapshots__/**/*',
        ],
    },
    {
        // Storybook story files - apply Storybook-specific rules
        files: ['**/*.stories.{ts,tsx,js,jsx}', '**/*-snapshot.{ts,tsx,js,jsx}'],
        plugins: {
            storybook,
        },
        rules: {
            ...storybook.configs.recommended.rules,
            'import/no-namespace': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/consistent-type-imports': 'off',
            '@typescript-eslint/no-floating-promises': 'off',
            '@typescript-eslint/require-await': 'off',
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            'custom/color-linter': 'off',
        },
    },
];
