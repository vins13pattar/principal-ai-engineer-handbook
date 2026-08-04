/// <reference types="astro/client" />

declare module "*.mmd?raw" {
  const content: string;
  export default content;
}
