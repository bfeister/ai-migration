/**
 * Email Subscribe Action
 *
 * SFRA equivalent: EmailSubscribe-Subscribe controller
 * Source: storefront-reference-architecture/cartridges/app_storefront_base/cartridge/controllers/EmailSubscribe.js
 *
 * Handles email newsletter subscription form submissions from the homepage.
 *
 * In SFRA, the form at the bottom of homePage.isml submits via jQuery AJAX:
 * <button data-href="${URLUtils.url('EmailSubscribe-Subscribe')}">
 *
 * In React Router 7, we use a resource route action for form handling.
 */
import { type ActionFunctionArgs, data } from 'react-router';

type EmailSubscribeResponse = {
    success: boolean;
    error?: string;
    message?: string;
};

/**
 * Action handler for email subscription
 *
 * Validates email and processes subscription request.
 * In production, this would integrate with a marketing automation service
 * (e.g., Salesforce Marketing Cloud, as referenced in SFRA's marketing-cloud.ts)
 */
// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: ActionFunctionArgs): Promise<Response> {
    const formData = await request.formData();
    const email = formData.get('email');

    // Validate email
    if (!email || typeof email !== 'string') {
        return data<EmailSubscribeResponse>(
            { success: false, error: 'Please enter a valid email address.' },
            { status: 400 }
        );
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return data<EmailSubscribeResponse>(
            { success: false, error: 'Please enter a valid email address.' },
            { status: 400 }
        );
    }

    try {
        // TODO: Integrate with Marketing Cloud or other email service
        // The SFRA EmailSubscribe controller typically:
        // 1. Validates the email
        // 2. Checks if already subscribed
        // 3. Adds to subscription list via Marketing Cloud API
        //
        // Example Marketing Cloud integration (see lib/marketing-cloud.ts):
        // await subscribeToNewsletter(context, email);

        // For now, simulate successful subscription
        console.log(`Email subscription request for: ${email}`);

        return data<EmailSubscribeResponse>({
            success: true,
            message: 'Thank you for subscribing!',
        });
    } catch (error) {
        console.error('Email subscription error:', error);
        return data<EmailSubscribeResponse>(
            {
                success: false,
                error: 'Unable to process your subscription. Please try again later.',
            },
            { status: 500 }
        );
    }
}
