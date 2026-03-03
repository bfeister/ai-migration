import type { HomeBanner5Props } from './types';

/**
 * Full-Height Banner Section 5 — mirrors SFRA #home-slot-5 content asset lk-home-banner-5.
 *
 * Full-width section with leather artisan background image, top gradient overlay
 * (dark blue #0d1b28 fading to transparent), and left-aligned text container
 * with subheading (h4), heading (h3), body text, and CTA link.
 *
 * Source fonts: Paperback9-Roman (headings/CTA), proxima-nova (body)
 * Falls back to Tailwind serif/sans since custom fonts are not bundled.
 */
export function HomeBanner5({ heading, subheading, body, backgroundImageUrl, backgroundImageAlt, cta }: HomeBanner5Props) {
    return (
        <div data-slot-id="lk-content-home-banner-5" className="relative h-[1000px] overflow-hidden">
            {/* Background image — fills section */}
            <img
                src={backgroundImageUrl}
                alt={backgroundImageAlt}
                className="absolute inset-0 h-full w-full object-cover"
            />

            {/* Gradient overlay at top — fades from dark blue to transparent */}
            <div className="absolute left-0 right-0 top-0 h-[300px] bg-gradient-to-b from-[#0d1b28] to-transparent" />

            {/* Text container — left-aligned, positioned in lower-left area */}
            <div className="absolute left-[192px] top-[484px] z-10 max-w-[575px] uppercase">
                <h4 className="my-6 font-serif text-[26px] uppercase leading-[31.2px] tracking-[-0.13px] text-white">
                    {subheading}
                </h4>
                <h3 className="my-8 font-serif text-[40px] leading-[40px] tracking-[-0.8px] text-white">
                    {heading}
                </h3>
                <p className="my-5 mb-12 font-sans text-[20px] normal-case tracking-[0.4px] text-white">
                    {body}
                </p>
                <div>
                    <a
                        href={cta.href}
                        className="mx-1 inline-block border-b border-white px-0 py-px font-serif text-[28px] uppercase tracking-[1.6px] text-white transition-opacity hover:opacity-80"
                    >
                        {cta.label}
                    </a>
                </div>
            </div>
        </div>
    );
}
