/**
 * Shared utilities for rendering todo items.
 *
 * Used by both ToolCallRenderer (inline tool results) and TodoPanel (persistent panel).
 */

import { setIcon } from 'obsidian';

import type { TodoItem } from '../../../core/tools';

/**
 * Gets the icon name for a todo item status.
 */
export function getTodoStatusIcon(status: TodoItem['status']): string {
  return status === 'completed' ? 'check' : 'dot';
}

/**
 * Gets the display text for a todo item based on its status.
 */
export function getTodoDisplayText(todo: TodoItem): string {
  return todo.status === 'in_progress' ? todo.activeForm : todo.content;
}

/**
 * Renders todo items into a container element.
 *
 * @param container - The parent element to render into (will be emptied first)
 * @param todos - Array of todo items to render
 */
export function renderTodoItems(
  container: HTMLElement,
  todos: TodoItem[]
): void {
  container.empty();

  for (const todo of todos) {
    const item = container.createDiv({ cls: `claudian-todo-item claudian-todo-${todo.status}` });

    const icon = item.createSpan({ cls: 'claudian-todo-status-icon' });
    icon.setAttribute('aria-hidden', 'true');
    setIcon(icon, getTodoStatusIcon(todo.status));

    const text = item.createSpan({ cls: 'claudian-todo-text' });
    text.setText(getTodoDisplayText(todo));
  }
}
