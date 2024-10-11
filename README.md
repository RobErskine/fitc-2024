# FITC 2024

This serves as a code repo for the examples show during the "[AI-Powered Content Management: Transforming Your Headless CMS With Storyblok](https://fitc.ca/presentation/ai-powered-content-management/)" talk at FITC 2024.

## Serverless Functions
There are two examples here that operate as serverless functions that are called via Storyblok Webhooks. 
![Storyblok webhooks](/media/storyblok-webhooks.jpg)

Each webhook is set up to only trigger on specific actions in Storyblok, for instance on Image Upload or on Story Publish. 

Each serverless function is set up in my base repo under `netlify/functions`, which is configured in Netlify. 

## Storyblok Tool Extensions.
You can read more about [Storyblok Tool Extensions here](https://www.storyblok.com/docs/plugins/tool).

The `styleguide-enforcer` is set up as it's own repo originally. For ease of use I included it here. Check out the [README](/styleguide-enforcer/README.md) for how to set that up within Storyblok.

![Storyblok extensions](/media/storyblok-toolkits.jpg)