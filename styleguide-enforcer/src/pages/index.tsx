import Head from 'next/head';
import { useAppBridge, useToolContext } from '@/hooks';
import { useState, useEffect } from 'react';
import StoryblokClient from 'storyblok-js-client';

// Initialize Storyblok Client
const Storyblok = new StoryblokClient({
  oauthToken: process.env.NEXT_PUBLIC_STORYBLOK_MANAGEMENT_API_TOKEN,
  accessToken: process.env.NEXT_PUBLIC_STORYBLOK_PREVIEW_TOKEN,
  region: 'us',
});

export default function Home() {
  const toolContext = useToolContext();
  const { completed } = useAppBridge({ type: 'tool-plugin', oauth: true });
  const [isLoading, setIsLoading] = useState(false);
  const [loadingCompleted, setLoadingCompleted] = useState(true);
  const [validationResult, setValidationResult] = useState(null);

  useEffect(() => {
    if (completed === undefined) {
      setLoadingCompleted(true);
    } else {
      setLoadingCompleted(false);
    }
  }, [completed]);

  const getStyleguide = async (styleguideSlug: string) => {
    const response = await Storyblok.get(`cdn/stories/${styleguideSlug}`, { version: 'published' });
    const styleGuideContent = response.data.story.content;
    console.log('Styleguide:', styleGuideContent);
    return styleGuideContent;
  };

  const getStoryContent = async (storySlug: string) => {
    const response = await Storyblok.get(`cdn/stories/${storySlug}`, { version: 'published'});
    const storyContent = response.data.story.content;
    console.log('Story:', storyContent);
    return storyContent;
  };

  const validateContentAgainstStyleguide = async (content: any, styleguide: any) => {
    const openAIUrl = 'https://api.openai.com/v1/chat/completions';
    const prompt = `
      You are a strict JSON validator. Given the following content and styleguide, your task is to analyze each field in the content and determine if it follows the styleguide. If a field doesn't follow the styleguide, provide a brief explanation why. In a new line, give your recommended fix. Only respond with with fields that match the name "content". There may be more than one field that matches the name "content"; please return them all.

      Content:
      ${JSON.stringify(content.bloks)}

      Styleguide:
      ${JSON.stringify(styleguide)}

      Respond strictly in the following JSON format:
      {
        "fieldName": {
          "follows": boolean,
          "_uid": "string", // retrieve the original _uid for the field 
          "explanation": "string (only if 'follows' is false)"
        }
      }

      Example of the expected JSON response:
      {
        "content": {
          "follows": true,
          "_uid": "b67099fb-d304-4403-9d27-80792f757b4d",
          "explanation": ""
        },
        "content": {
          "follows": false,
          "_uid": "6be42f71-15fb-4ec0-9f30-fe6a7ad38b1e",
          "explanation": "The content does not meet the styleguide requirements because ..."
        }
      }

      Please ensure the response is a valid JSON object with no additional commentary or formatting.
    `;

    const openAIResponse = await fetch(openAIUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
      }),
    });

    if (!openAIResponse.ok) {
      const error = await openAIResponse.text();
      throw new Error(`OpenAI API Error: ${openAIResponse.status} ${openAIResponse.statusText} - ${error}`);
    }

    const data = await openAIResponse.json();
		console.log('OpenAI Response:', data);
		let validateData;

		try {
			const rawContent = data.choices[0].message.content;
			const cleanedContent = rawContent.replace(/```json|```/g, '').trim();
			
			// Custom parsing to handle multiple "content" keys
			const contentRegex = /"content"\s*:\s*({[^}]+})/g;
			const matches = [...cleanedContent.matchAll(contentRegex)];
			
			validateData = matches.map(match => {
				const contentObject = JSON.parse(match[1]);
				return {
					fieldName: "content",
					...contentObject
				};
			});
	
		} catch (error) {
			console.error('Failed to parse JSON:', error);
			throw new Error('Received invalid JSON from OpenAI API');
		}
	
		console.log({ validateData });
		return validateData;
  };

  const createDiscussion = async (fieldName, block_uid, explanation) => {
    try {
      const response = await Storyblok.post(`/spaces/${process.env.NEXT_PUBLIC_STORYBLOK_SPACE_ID}/stories/${toolContext.story.id}/discussions`, {
        discussion: {
          comment: {
            message_json: [
              {
                type: 'text',
                text: explanation,
              },
            ],
          },
          lang: 'default',
          title: fieldName,
          fieldname: fieldName,
          block_uid: block_uid,
          component: 'RichText',
        },
      });
      console.log('Discussion created:', response);
    } catch (error) {
      console.error('Error creating discussion:', error);
    }
  };

	const handleValidationClick = async () => {
		setIsLoading(true);
		try {
			const styleguide = await getStyleguide('12729627');
			const storyContent = await getStoryContent(toolContext.story.slug);
			const validationResults = await validateContentAgainstStyleguide(storyContent, styleguide);
	
			setValidationResult(validationResults);
	
			let discussionsCreated = 0;
			for (const result of validationResults) {
				if (!result.follows) {
					await createDiscussion(result.fieldName, result._uid, result.explanation);
					discussionsCreated++;
				}
			}
			console.log(`Created ${discussionsCreated} discussions`);
		} catch (error) {
			console.error('Validation error:', error);
		} finally {
			setIsLoading(false);
		}
	};

  return (
    <>
      <Head>
        <title>Styleguide Enforcer</title>
        <meta name="description" content="Generated by create next app" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          {`
            body {
              font-family: helvetica, arial, sans-serif;
            }
            p {
              margin-top: 0px;
            }
          `}
        </style>
      </Head>
      <main>
        {loadingCompleted ? (
          <p>Loading...</p>
        ) : (
          completed && toolContext && (
            <div>
              <p>This tool will compare this page ("{toolContext.story.name}") against the styleguide and offer up any potential improvements as Storyblok Discussions.</p>
              <button onClick={handleValidationClick} disabled={isLoading}>
                {isLoading ? 'Validating...' : `Check against Styleguide`}
              </button>
              {validationResult && (
                <div>
                  <h3>Validation Results:</h3>
                  {validationResult.map((result, index) => (
                    <pre key={index}>{JSON.stringify(result, null, 2)}</pre>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </main>
    </>
  );
}
