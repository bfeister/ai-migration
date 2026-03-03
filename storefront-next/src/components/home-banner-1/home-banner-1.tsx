import type { HomeBanner1Props } from './types';

/**
 * Primary Hero Banner — mirrors SFRA #home-slot-1 content asset lk-home-banner-1.
 *
 * Two-panel layout:
 *   Panel 1 (banner-top): Full-width hero with background image, centered text + CTA
 *   Panel 2 (banner-bottom): Dark section with centered text + watermark logo
 *
 * Source fonts: Paperback9-Roman (headings/CTA), proxima-nova (body)
 * Falls back to Tailwind serif/sans since custom fonts are not bundled.
 */
export function HomeBanner1({ topPanel, bottomPanel }: HomeBanner1Props) {
    return (
        <div data-slot-id="lk-content-home-banner-1">
            {/* Panel 1: banner-top — full-width hero with background image */}
            <div className="relative h-[1000px] overflow-hidden">
                {/* Background image — fills panel, centered via object-cover */}
                <img
                    src={topPanel.backgroundImageUrl}
                    alt={topPanel.backgroundImageAlt}
                    className="absolute inset-0 h-full w-full object-cover"
                />

                {/* Gradient overlay at bottom — fades from dark blue to transparent */}
                <div className="absolute bottom-0 left-0 right-0 h-[300px] bg-gradient-to-t from-[#0d1b28] to-transparent" />

                {/* Text container — centered over hero image */}
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                    <div className="max-w-[600px] text-center uppercase">
                        <h3 className="my-8 font-serif text-[40px] leading-[40px] tracking-[-0.8px] text-white">
                            {topPanel.heading}
                        </h3>
                        <p className="my-5 font-sans text-[20px] tracking-[0.4px] text-white">
                            {topPanel.body}
                        </p>
                        {topPanel.cta && (
                            <div className="pt-1.5">
                                <a
                                    href={topPanel.cta.href}
                                    className="mx-4 inline-block border-b border-white px-0 py-px font-serif text-[28px] uppercase tracking-[1.6px] text-white transition-opacity hover:opacity-80"
                                >
                                    {topPanel.cta.label}
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Panel 2: banner-bottom — dark blue section with watermark */}
            <div className="relative h-[620px] overflow-hidden bg-[#0d1b28]">
                {/* Watermark logo — very faint centered-left */}
                {bottomPanel.watermarkLogoUrl && (
                    <img
                        src={bottomPanel.watermarkLogoUrl}
                        alt=""
                        aria-hidden="true"
                        className="absolute left-[15%] top-0 h-full w-auto opacity-[0.05]"
                    />
                )}

                {/* Text container — centered */}
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                    <div className="max-w-[600px] text-center uppercase">
                        <h3 className="my-8 font-serif text-[40px] leading-[40px] tracking-[-0.8px] text-white">
                            {bottomPanel.heading}
                        </h3>
                        <p className="my-5 font-sans text-[20px] normal-case tracking-[0.4px] text-white">
                            {bottomPanel.body}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
