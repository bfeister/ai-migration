export interface BannerPanel {
    heading: string;
    body: string;
    backgroundImageUrl: string;
    backgroundImageAlt: string;
    cta?: {
        label: string;
        href: string;
    };
}

export interface HomeBanner1Props {
    topPanel: BannerPanel;
    bottomPanel: Omit<BannerPanel, 'cta'> & {
        watermarkLogoUrl?: string;
    };
}
