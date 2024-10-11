import type { Context } from '@netlify/functions';
import fetch from 'node-fetch';
import StoryblokClient from 'storyblok-js-client';

const Storyblok = new StoryblokClient({
  oauthToken: process.env.STORYBLOK_MANAGEMENT_API_TOKEN,
  accessToken: process.env.NEXT_PUBLIC_STORYBLOK_PREVIEW_TOKEN,
  region: 'us',
});

async function getStoryContent(storySlug: string) {
  try {
    const response = await Storyblok.getStory(storySlug, {
      version: 'published',
    });
    console.log('story from sb', response.data.story);
    return response.data.story;
  } catch (error) {
    console.error('Error fetching story content:', error);
    throw new Error(`Storyblok API Error: ${error.message}`);
  }
}

async function updateStoryMetadata(storyId: number, existingContent: any, seoMetadata: any) {
  try {
    // Merge the new SEO metadata into the existing content
    const updatedContent = {
      ...existingContent,
      SEO: {
        ...existingContent.SEO,
        title: seoMetadata.title,
        plugin: 'seo_metatags',
        og_image: existingContent.SEO?.og_image || '',
        og_title: seoMetadata.og_title,
        description: seoMetadata.description,
        twitter_image: existingContent.SEO?.twitter_image || '',
        twitter_title: seoMetadata.twitter_title,
        og_description: seoMetadata.og_description,
        twitter_description: seoMetadata.twitter_description,
      },
    };

    const response = await Storyblok.put(
      `spaces/${process.env.STORYBLOK_SPACE_ID}/stories/${storyId}`,
      {
        story: {
          id: storyId,
          content: updatedContent,
        },
      }
    );
    console.log({ response });
    return response;
  } catch (error) {
    console.error('Error updating story metadata:', error);
    throw new Error(`Storyblok API Error: ${error.message}`);
  }
}

async function generateSeoMetadata(storyContent: any) {
  const openAIUrl = 'https://api.openai.com/v1/chat/completions';
  const prompt = `
    Given the following content for a web page, generate SEO metadata:
    ${JSON.stringify(storyContent)}

    Please provide the following in EXACTLY this JSON format:
    {
      "title": "string (Max 32 characters)",
      "description": "string (max 60 characters)",
      "og_title": "string (max 60 characters)",
      "og_description": "string (max 200 characters)",
      "twitter_title": "string (max 60 characters)", // the twitter title should be snarky to get more clicks and appease the Elon algorithm
      "twitter_description": "string (max 200 characters)"
    }

    Ensure the content is engaging, relevant, and optimized for social sharing.
  `;

  const openAIResponse = await fetch(openAIUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    }),
  });

  if (!openAIResponse.ok) {
    const error = await openAIResponse.text();
    throw new Error(
      `OpenAI API Error: ${openAIResponse.status} ${openAIResponse.statusText} - ${error}`
    );
  }

  const data = await openAIResponse.json();
  console.log('openAI response', data);

  try {
    // Strip out the code block delimiters (```json ... ```)
    const content = data.choices[0].message.content.trim();
    const jsonString = content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1);

    // Parse the response content to JSON
    const seoMetadata = JSON.parse(jsonString);

    // Optional: Validate the structure of the JSON response
    validateSeoMetadata(seoMetadata);

    return seoMetadata;
  } catch (error) {
    throw new Error(`Invalid JSON format returned by OpenAI: ${error.message}`);
  }
}

// Optional: Function to validate JSON structure
function validateSeoMetadata(metadata: any) {
  const requiredFields = [
    'title',
    'description',
    'og_title',
    'og_description',
    'twitter_title',
    'twitter_description',
  ];
  requiredFields.forEach((field) => {
    if (!metadata.hasOwnProperty(field)) {
      throw new Error(`Missing required field: ${field}`);
    }
    if (typeof metadata[field] !== 'string') {
      throw new Error(`Field ${field} must be a string`);
    }
  });
}

export default async (req: Request, context: Context) => {
  try {
    const webhookPayload = await req.json();
    const { story_id, full_slug } = webhookPayload;

    console.log('Received webhook payload:', webhookPayload);

    // Fetch the published story content
    const storyContent = await getStoryContent(full_slug);

    // Generate SEO metadata
    const seoMetadata = await generateSeoMetadata(storyContent);

    // Update the story with new SEO metadata
    const updatedStory = await updateStoryMetadata(story_id, storyContent.content, seoMetadata);

    return new Response(
      JSON.stringify({
        message: 'SEO metadata generated and updated successfully',
        storyId: story_id,
        fullSlug: full_slug,
        updatedMetadata: seoMetadata,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
