import type { Context } from '@netlify/functions';
import fetch from 'node-fetch';
import StoryblokClient from 'storyblok-js-client';

function extractImageUrl(text: string): string | null {
  const urlRegex =
    /https:\/\/a-[a-z]+\.storyblok\.com\/f\/\d+\/\d+x\d+\/[a-f0-9]+\/[^.\s]+\.(jpg|png|gif|jpeg)/i;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
}

const Storyblok = new StoryblokClient({
  oauthToken: process.env.STORYBLOK_MANAGEMENT_API_TOKEN,
  region: 'us',
});

async function updateStoryblokAsset(assetId: number, altText: string) {
  try {
    console.log(`Updating asset ${assetId} with alt text: ${altText}`);

    const response = await Storyblok.put(
      `/spaces/${process.env.STORYBLOK_SPACE_ID}/assets/${assetId}`,
      {
        meta_data: {
          alt: altText,
        },
      }
    );

    console.log('Storyblok API Response:', response);

    return response.data;
  } catch (error) {
    console.error('Error updating Storyblok asset:', error);
    if (error.response) {
      console.error('Error response:', error.response.data);
    }
    throw new Error(`Storyblok API Error: ${error.message}`);
  }
}

export default async (req: Request, context: Context) => {
  try {
    const contentRequest = await req.json();
    const imageURL = extractImageUrl(contentRequest.text);
    const assetId = contentRequest.asset_id;

    console.log(contentRequest);

    if (!imageURL) {
      return new Response(JSON.stringify({ error: 'Image URL not found in the webhook payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const openAIUrl = 'https://api.openai.com/v1/chat/completions';
    const openAIResponse = await fetch(openAIUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'You are a content editor for a major website publication. Please create an accessible alternative text under 100 words that describes this image. Only return the single string of the returned alternative text. If you detect that the image is an icon for presentation purposes ONLY, please return with the string "For presentation only!"',
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageURL,
                },
              },
            ],
          },
        ],
        max_tokens: 300,
      }),
    });

    if (!openAIResponse.ok) {
      const error = await openAIResponse.text();
      throw new Error(
        `OpenAI API Error: ${openAIResponse.status} ${openAIResponse.statusText} - ${error}`
      );
    }

    const data = await openAIResponse.json();
    console.log('OpenAI API Response:', data);
    const generatedAltText = data.choices[0].message.content;
    console.log({ generatedAltText });

    // Update the asset in Storyblok with the generated alt text
    const updatedAsset = await updateStoryblokAsset(assetId, generatedAltText);

    return new Response(
      JSON.stringify({
        altText: generatedAltText,
        updatedAsset: updatedAsset,
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
