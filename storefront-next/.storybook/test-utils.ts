import { waitFor } from 'storybook/test';

/**
 * Waits for the Storybook loading placeholder to disappear, ensuring the component is fully mounted
 * before interaction tests run. This prevents test failures due to components unmounting during initialization.
 *
 * @param canvasElement - The canvas element from the Storybook play function
 * @param timeout - Optional timeout in milliseconds (default: 5000)
 * @returns Promise that resolves when the component is ready
 *
 * @example
 * ```ts
 * play: async ({ canvasElement }) => {
 *   await waitForStorybookReady(canvasElement);
 *   // Your test code here
 * }
 * ```
 */
export async function waitForStorybookReady(
    canvasElement: HTMLElement,
    timeout = 5000
): Promise<void> {
    await waitFor(
        () => {
            const loadingPlaceholder = canvasElement.querySelector('[data-storybook-loading="true"]');
            if (loadingPlaceholder) {
                throw new Error('Component still loading');
            }
        },
        { timeout }
    );
}

