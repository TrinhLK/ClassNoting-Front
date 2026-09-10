import { http, HttpResponse } from "msw";
import { setEnv } from "../mock-env";

setEnv();

export const handlers = [
  http.post("https://opencode.ai/zen/go/v1/chat/completions", () => {
    return HttpResponse.json({
      choices: [
        {
          message: {
            content: "[{\"task\":\"Test\",\"assignee\":\"An\",\"deadline\":\"Chưa rõ\"}]",
          },
        },
      ],
    });
  }),

  http.post("https://api.meetingbaas.com/v2/bots", () => {
    return HttpResponse.json({
      success: true,
      data: { bot_id: "bot_test_123" },
    });
  }),

  http.post("https://accounts.google.com/o/oauth2/v2/auth", () => {
    return HttpResponse.text("oauth-redirect");
  }),
];
