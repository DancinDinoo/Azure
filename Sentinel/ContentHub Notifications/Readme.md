## Sentinel Content Hub Notifications
Strangely Sentinel doesn't automatically tell you when you have Content Hub package updates available in Sentinel. This means if you're managing multiple tenancies it can be hard to track without manual review everyday which for smaller teams can be time consuming.

To solve this I've designed a script that checks the relevant Content Hub github pages where updates are announced and return those that have changed.

This script is designed to do the following:

1.  Run on a weekly timer as an Azure Function
2.  Check Azure Tables for URL entries referencing the relevant client Content Hub package GitHub pages
3.  Hash the raw webpage table containing the update logs
4.  Update the hash if new page detected

To work fully this requires deployment of a Logic App that checks the relevant storage table for changes and sends an email notification.
