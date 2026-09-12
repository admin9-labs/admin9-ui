import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const composerSource = readFileSync(resolve(process.cwd(), 'src/components/chat-composer/index.vue'), 'utf8');

describe('AChatComposer style contract', () => {
  it('uses one outer card as the visible composer surface', () => {
    const rootDeclarations = composerSource.match(/\.a9-chat-composer\s*{([\s\S]*?)&:focus-within/)?.[1];

    expect(rootDeclarations).toContain(
      'padding: var(--a9-chat-composer-padding-block) var(--a9-chat-composer-padding-inline);'
    );
    expect(rootDeclarations).toContain('background: var(--color-bg-2);');
    expect(rootDeclarations).toContain('border: 1px solid var(--color-border-2);');
    expect(rootDeclarations).toContain('border-radius: 8px;');
  });

  it('removes the nested textarea surface in every interactive state', () => {
    const textareaRule = composerSource.match(/&__input > :deep\(\.arco-textarea-wrapper\),([\s\S]*?)&__header/)?.[1];

    expect(composerSource).toContain('class="a9-chat-composer__input"');
    expect(textareaRule).toContain('&__input > :deep(.arco-textarea-wrapper:hover)');
    expect(textareaRule).toContain(':focus-within');
    expect(textareaRule).toContain('.arco-textarea-focus');
    expect(textareaRule).toContain('background: transparent;');
    expect(textareaRule).toContain('border-width: 0;');
    expect(textareaRule).toContain('border-color: transparent;');
    expect(textareaRule).toContain('box-shadow: none;');
  });

  it('moves built-in textarea errors to the composer border', () => {
    const errorRule = composerSource.match(
      /:global\(\.a9-chat-composer:has\(> \.a9-chat-composer__input > \.arco-textarea-error\)\)\s*{([^}]*)}/
    )?.[1];

    expect(errorRule).toContain('border-color: rgb(var(--danger-6));');
  });

  it('defines the complete small, medium and large density scale', () => {
    const expected = {
      small: ['8px', '12px', '4px', '4px', '8px', '4px'],
      medium: ['10px', '14px', '6px', '6px', '10px', '6px'],
      large: ['12px', '16px', '8px', '8px', '12px', '8px'],
    };

    Object.entries(expected).forEach(([size, values]) => {
      const rule = composerSource.match(new RegExp(`&--${size}\\s*{([^}]*)}`))?.[1] ?? '';
      [
        '--a9-chat-composer-padding-block',
        '--a9-chat-composer-padding-inline',
        '--a9-chat-composer-content-gap',
        '--a9-chat-composer-toolbar-gap',
        '--a9-chat-composer-bar-gap',
        '--a9-chat-composer-section-gap',
      ].forEach((property, index) => expect(rule).toContain(`${property}: ${values[index]};`));
    });
  });

  it('lets Arco size the circular default action without fixed dimensions', () => {
    const actionDeclarations = composerSource.match(/&__action\s*{([^}]*)}/)?.[1];

    expect(composerSource).toContain('shape="circle"');
    expect(composerSource).toContain(':size="size"');
    expect(actionDeclarations).toContain('flex: none;');
    expect(actionDeclarations).not.toContain('width:');
    expect(actionDeclarations).not.toContain('height:');
  });

  it('vertically centers mixed toolbar controls', () => {
    const toolbarDeclarations = composerSource.match(/&__toolbar\s*{([^}]*)}/)?.[1];

    expect(toolbarDeclarations).toContain('align-items: center;');
  });
});
