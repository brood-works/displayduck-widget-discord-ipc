<a id="readme-top"></a>

<div align="center">

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]

</div>


<br />
<div align="center">
  <a href="https://github.com/brood-works/displayduck-pack-discord-ipc">
    <img src="logo.png" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">DisplayDuck Discord Widget</h3>

  <p align="center">
    Ported to DisplayDuck from <a href="https://github.com/jagrosh/DiscordIPC">jagrosh/DiscordIPC</a>
  </p>
</div>

---

> [!WARNING]
> This widget is built with the help of AI, and may contain bugs.

> [!WARNING]
> IPC/RPC connetions are currently unstable, expect connection issues, timeouts or other bugs to occur.

---

## About
This widget displays the participants in your current voice channel or call, on pressing a participant you can mute/unmute them.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

This is an example of how you may give instructions on setting up your project locally.
To get a local copy up and running follow these simple example steps.

### Prerequisites

Currently the <a href="https://docs.discord.com/developers/topics/rpc">Discord RPC API</a> states that the RPC API is in private beta, this means that you need your **own** <a href="https://discord.com/developers/applications">Discord Application ID</a> in order to use this widget.

### Setting up a Discord Application

1. Go to <a href="https://discord.com/developers/applications">applications</a>
2. Make up an application name *(eg DisplayDuck Widget)*
3. Go to `Oauth2` and setup `http://localhost` as Redirect URL under `Redirects`
4. Go (back) to `General Information` and copy the `Application ID`
5. Use this `Application ID` in the `Application Client ID` field in the widget config


<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Configurable options
| Setting | Description |Type | Configurable Values | Default Value
|---|---|---|---|---|
|Auto-hide| Do not display content when Discord is not running or when you are not connected to a call or channel | `boolean` | `true`/`false` | `false`
|Show Participant Names| Wether to show participant names under their avatar | `boolean` | `true`/`false` | `true`
|Alignment| How to align the participants within the widget | `dropdown` | `top-left`<br/>`top-right`<br/>`bottom-left`<br/>`bottom-right` | `top-left`
|Application Client ID| Application ID used to connect | `string`

## Participant icon states
| Icon | State 
|---|---|
|<img src="img/mic-selfmuted.png#gh-light-mode-only" width="36"/><img src="img/mic-selfmuted_light.png#gh-dark-mode-only" width="36"/>| User has muted their own mic |
|<img src="img/mic-muted.png#gh-light-mode-only" width="36"/><img src="img/mic-muted_light.png#gh-dark-mode-only" width="36"/>| User is muted by you |
|<img src="img/mic-servermuted.png" width="36"/>| User is servermuted |
|<img src="img/deafened.png#gh-light-mode-only" width="36"/><img src="img/deafened_light.png#gh-dark-mode-only" width="36"/>| User is deafened by either themself or the server|

<p align="right">(<a href="#readme-top">back to top</a>)</p>


## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Contributors:

<a href="https://github.com/brood-works/displayduck-pack-discord-ipc/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=brood-works/displayduck-pack-discord-ipc" />
</a>


<p align="right">(<a href="#readme-top">back to top</a>)</p>

[contributors-shield]: https://img.shields.io/github/contributors/brood-works/displayduck-pack-discord-ipc.svg
[contributors-url]: https://github.com/brood-works/displayduck-pack-discord-ipc/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/brood-works/displayduck-pack-discord-ipc
[forks-url]: https://github.com/brood-works/displayduck-pack-discord-ipc/network/members
[stars-shield]: https://img.shields.io/github/stars/brood-works/displayduck-pack-discord-ipc
[stars-url]: https://github.com/othneildrew/Best-README-Template/stargazers
[issues-shield]: https://img.shields.io/github/issues/brood-works/displayduck-pack-discord-ipc
[issues-url]: https://github.com/othneildrew/Best-README-Template/issues