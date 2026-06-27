// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PluginMarketplaceDemo } from '../../src/components/PluginMarketplaceDemo';

afterEach(() => {
  cleanup();
});

function catalog() {
  return document.querySelector('.plugin-marketplace__catalog') as HTMLElement;
}

describe('PluginMarketplaceDemo', () => {
  it('opens details by clicking an uninstalled plugin card and hides more actions', () => {
    render(<PluginMarketplaceDemo />);

    const area = catalog();
    expect(within(area).getByText('GitHub')).toBeTruthy();
    expect(within(area).getByText('Review PRs, triage issues, inspect CI, and publish release notes.')).toBeTruthy();
    expect(within(area).getAllByRole('button', { name: '安装' }).length).toBeGreaterThan(0);
    expect(within(area).queryByRole('button', { name: 'GitHub more actions' })).toBeNull();
    expect(within(area).queryByText('账号授权、权限范围和外部数据连接。')).toBeNull();

    fireEvent.click(within(area).getByText('GitHub').closest('article') as HTMLElement);

    expect(within(area).getByText('账号授权、权限范围和外部数据连接。')).toBeTruthy();
    expect(within(area).getByText('暴露给 Agent 调用的工具与上下文能力。')).toBeTruthy();
    expect(within(area).getByText('可复用的任务流程、审查规则和生成策略。')).toBeTruthy();
    expect(within(area).getByText('GitHub OAuth')).toBeTruthy();
    expect(within(area).getByText('search_issues')).toBeTruthy();
    expect(within(area).getByText('PR review')).toBeTruthy();
  });

  it('switches the source filter when selecting an installed workspace plugin icon', () => {
    render(<PluginMarketplaceDemo />);

    const area = catalog();
    expect(within(area).queryByText('Notion')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Notion' }));

    expect(within(area).getByText('Notion')).toBeTruthy();
    expect(within(area).getByRole('button', { name: 'Try it' })).toBeTruthy();
    expect(within(area).getByRole('button', { name: 'Notion more actions' })).toBeTruthy();
    expect(within(area).queryByText('Workspace connection')).toBeNull();
    expect(screen.getByRole('button', { name: '由你的工作空间提供' }).className).toContain('is-active');
    expect(screen.getByRole('button', { name: 'Productivity' }).className).toContain('is-active');
  });

  it('lets installed plugins open an uninstall menu and try from home', () => {
    const onTryPlugin = vi.fn();
    render(<PluginMarketplaceDemo onTryPlugin={onTryPlugin} />);

    const area = catalog();
    const figmaRow = within(area).getByText('Figma').closest('article') as HTMLElement;
    fireEvent.click(within(figmaRow).getByRole('button', { name: 'Try it' }));
    expect(onTryPlugin).toHaveBeenCalledWith(expect.objectContaining({ name: 'Figma' }));

    fireEvent.click(within(figmaRow).getByRole('button', { name: 'Figma more actions' }));
    expect(within(figmaRow).getByRole('menuitem', { name: '卸载' })).toBeTruthy();
  });

  it('opens a create panel for plugin and skill imports without a marketplace kicker', () => {
    render(<PluginMarketplaceDemo />);

    expect(screen.queryByText('MARKETPLACE')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '新增' }));

    expect(screen.getByRole('dialog', { name: '新增 Plugin' })).toBeTruthy();
    expect(screen.getByText('从 GitHub 链接导入')).toBeTruthy();
    expect(screen.getByText('导入本地文件夹')).toBeTruthy();
    expect(screen.getByPlaceholderText('https://github.com/org/open-design-plugin')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Skill' }));
    expect(screen.getByRole('dialog', { name: '新增 Skill' })).toBeTruthy();
    expect(screen.getByPlaceholderText('例如 Brand QA Reviewer')).toBeTruthy();
    expect(screen.getByRole('button', { name: '创建 Skill' })).toBeTruthy();
  });

  it('keeps search scoped to plugin names, descriptions, and categories', () => {
    render(<PluginMarketplaceDemo />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search plugins' }), {
      target: { value: 'drive' },
    });

    const area = catalog();
    expect(within(area).getByText('Google Drive')).toBeTruthy();
    expect(within(area).queryByText('GitHub')).toBeNull();
  });

  it('shows skills as a separate marketplace mode', () => {
    render(<PluginMarketplaceDemo />);

    fireEvent.click(screen.getByRole('button', { name: '技能' }));

    expect(screen.getByRole('heading', { name: '技能' })).toBeTruthy();
    expect(screen.getByText('技能是可复用的任务流程和审查规则。它可以被插件携带，也可以作为独立能力直接使用。')).toBeTruthy();
    expect(screen.getByText('Template Creator')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Template Creator more actions' })).toBeNull();
    expect(screen.queryByText('Installed')).toBeNull();
  });
});
