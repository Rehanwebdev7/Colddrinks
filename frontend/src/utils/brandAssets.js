// Local brand asset kept in public so it works on Vercel and during local development.
export const LOCAL_BRAND_LOGO = '/logo/ChatGPT%20Image%20Aug%202%2C%202026%2C%2012_12_36%20PM.png'

// The bundled asset is the canonical storefront/admin mark. Keeping this local
// avoids broken Google Drive/Cloudinary URLs after deployment.
export const getBrandLogo = () => LOCAL_BRAND_LOGO
export const getBrandIcon = () => LOCAL_BRAND_LOGO
