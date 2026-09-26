import {
  FEEDBACK_FROM_EMAIL,
  sendCancellationFeedbackEmail,
} from '@/functions/src/subscriptionFeedbackEmail';

const mockFetch = jest.fn();

describe('sendCancellationFeedbackEmail', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, RESEND_API_KEY: 're_test_key' };
    global.fetch = mockFetch;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email_123' }),
      text: async () => '',
    });
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('sends the cancelled copy with expected subject and from', async () => {
    const result = await sendCancellationFeedbackEmail({
      email: 'user@example.com',
      reason: 'cancelled',
    });

    expect(result).toEqual({ id: 'email_123' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.resend.com/emails');

    const init = mockFetch.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer re_test_key');

    const body = JSON.parse(init.body);
    expect(body.from).toBe(FEEDBACK_FROM_EMAIL);
    expect(body.from).toBe('ShowSeek <feedback@show-seek.app>');
    expect(body.to).toEqual(['user@example.com']);
    expect(body.subject).toBe('Sorry to see you go — mind telling me why?');
    expect(body.text).toContain("You'll keep your premium features");
    expect(body.text).toContain('— Shamar');
    expect(body.html).toContain('<p>');
    expect(body.html).toContain("You'll keep your premium features");
  });

  it('sends the expired copy with expected subject', async () => {
    await sendCancellationFeedbackEmail({
      email: 'user@example.com',
      reason: 'expired',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.from).toBe('ShowSeek <feedback@show-seek.app>');
    expect(body.to).toEqual(['user@example.com']);
    expect(body.subject).toBe('Your ShowSeek premium just ended');
    expect(body.text).toContain('your ShowSeek premium access ended today');
    expect(body.text).toContain('— Shamar');
    expect(body.html).toContain('<p>');
    expect(body.html).toContain('your ShowSeek premium access ended today');
  });

  it('throws when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;

    await expect(
      sendCancellationFeedbackEmail({ email: 'user@example.com', reason: 'cancelled' })
    ).rejects.toThrow('RESEND_API_KEY');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when RESEND_API_KEY is blank', async () => {
    process.env.RESEND_API_KEY = '   ';

    await expect(
      sendCancellationFeedbackEmail({ email: 'user@example.com', reason: 'expired' })
    ).rejects.toThrow('RESEND_API_KEY');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws on a non-2xx Resend response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => 'Invalid API key',
    });

    const error = await sendCancellationFeedbackEmail({
      email: 'user@example.com',
      reason: 'cancelled',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('401');
    expect((error as Error).message).toContain('Invalid API key');
  });
});
