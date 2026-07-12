using UnityEngine;

public class RetroSoundGenerator : MonoBehaviour
{
    public static RetroSoundGenerator Instance;
    private AudioSource audioSource;

    void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
            audioSource = gameObject.AddComponent<AudioSource>();
            audioSource.playOnAwake = false;
        }
        else
        {
            Destroy(gameObject);
        }
    }

    public void PlayTextBlip()
    {
        PlayTone(450f, 0.03f, 0.2f);
    }

    public void PlaySelect()
    {
        PlayTone(650f, 0.05f, 0.25f);
    }

    public void PlaySlash()
    {
        PlaySweep(900f, 150f, 0.18f, 0.35f);
    }

    public void PlayHurt()
    {
        PlaySweep(180f, 50f, 0.25f, 0.45f);
    }

    private void PlayTone(float frequency, float duration, float volume)
    {
        AudioClip clip = CreateToneClip(frequency, duration, volume);
        if (clip != null && audioSource != null)
        {
            audioSource.PlayOneShot(clip);
        }
    }

    private void PlaySweep(float startFreq, float endFreq, float duration, float volume)
    {
        AudioClip clip = CreateSweepClip(startFreq, endFreq, duration, volume);
        if (clip != null && audioSource != null)
        {
            audioSource.PlayOneShot(clip);
        }
    }

    private AudioClip CreateToneClip(float frequency, float duration, float volume)
    {
        int sampleRate = 44100;
        int sampleCount = (int)(sampleRate * duration);
        float[] samples = new float[sampleCount];
        for (int i = 0; i < sampleCount; i++)
        {
            float t = (float)i / sampleRate;
            float envelope = Mathf.Clamp01((duration - t) / 0.005f) * Mathf.Clamp01(t / 0.002f);
            samples[i] = Mathf.Sin(2 * Mathf.PI * frequency * t) * envelope * volume;
        }
        AudioClip clip = AudioClip.Create("Tone", sampleCount, 1, sampleRate, false);
        clip.SetData(samples, 0);
        return clip;
    }

    private AudioClip CreateSweepClip(float startFreq, float endFreq, float duration, float volume)
    {
        int sampleRate = 44100;
        int sampleCount = (int)(sampleRate * duration);
        float[] samples = new float[sampleCount];
        for (int i = 0; i < sampleCount; i++)
        {
            float t = (float)i / sampleRate;
            float phase = t / duration;
            float currentFreq = Mathf.Lerp(startFreq, endFreq, phase);
            float envelope = Mathf.Clamp01((duration - t) / 0.01f) * Mathf.Clamp01(t / 0.002f);
            samples[i] = Mathf.Sin(2 * Mathf.PI * currentFreq * t) * envelope * volume;
        }
        AudioClip clip = AudioClip.Create("Sweep", sampleCount, 1, sampleRate, false);
        clip.SetData(samples, 0);
        return clip;
    }
}
