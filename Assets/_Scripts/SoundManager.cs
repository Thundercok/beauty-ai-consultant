using UnityEngine;

public class SoundManager : MonoBehaviour
{
    public static SoundManager Instance { get; private set; }

    [Header("Audio Source")]
    [SerializeField] private AudioSource _audioSource;

    [Header("Audio Clips")]
    [SerializeField] private AudioClip _selectClip;
    [SerializeField] private AudioClip _textClip;
    [SerializeField] private AudioClip _slashClip;
    [SerializeField] private AudioClip _hurtClip;

    // Public Properties for editor access
    public AudioSource AudioSource { get => _audioSource; set => _audioSource = value; }
    public AudioClip SelectClip { get => _selectClip; set => _selectClip = value; }
    public AudioClip TextClip { get => _textClip; set => _textClip = value; }
    public AudioClip SlashClip { get => _slashClip; set => _slashClip = value; }
    public AudioClip HurtClip { get => _hurtClip; set => _hurtClip = value; }

    private void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
        }
        else
        {
            Destroy(gameObject);
        }
    }

    public void PlaySelect()
    {
        if (_audioSource != null && _selectClip != null)
        {
            _audioSource.PlayOneShot(_selectClip);
        }
    }

    public void PlayTextBlip()
    {
        if (_audioSource != null && _textClip != null)
        {
            _audioSource.PlayOneShot(_textClip);
        }
    }

    public void PlaySlash()
    {
        if (_audioSource != null && _slashClip != null)
        {
            _audioSource.PlayOneShot(_slashClip);
        }
    }

    public void PlayHurt()
    {
        if (_audioSource != null && _hurtClip != null)
        {
            _audioSource.PlayOneShot(_hurtClip);
        }
    }
}
