# Me App (Android)

Personal app: quick spend logging, brother's money ledger, 15% investing, shopping and reminders, and the baby and wedding fund planner.

This branch is separate from the job tracker. The phone app loads its screens from `web/index.html` on this branch. Editing that file updates the app on the phone the next time it opens or you tap refresh, so there's nothing to reinstall. Changes to the Android wrapper (`app/`) need a new APK, which every push builds and publishes under Releases. New builds install over the old one and keep your data.
