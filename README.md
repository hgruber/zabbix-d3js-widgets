# zabbix-d3js-widgets
just some simple javascript widgets for customizable zabbix dashboards
![ScreenShot](https://raw.githubusercontent.com/hgruber/zabbix-d3js-widgets/master/timeSeries.png)
![ScreenShot](https://raw.githubusercontent.com/hgruber/zabbix-d3js-widgets/master/triggerTable.png)

The widgets provide a very simple way to easily integrate zabbix information on your own dashboard. It just uses javascript (jquery, d3, jqzabbix) and the zabbix api to create self-updating animated tables and graphs.

installation
============
* copy the files to your document root
* provide the zabbix api url and credentials in samples.html (https://<domain>/zabbix/api_jsonrpc.php)
* for zabbix < 2.4: provide the zabbix patch for cross site requests (https://support.zabbix.com/browse/ZBXNEXT-1377)

timeSeries
==========
timeSeries is a widget to diplay timeseries data from zabbix in a simple to use graph. Intuitive scrolling and panning is provided in realtime doing api calls in the background. 

triggerTable
============
triggerTable displays all alerting zabbix triggers in an animated table. Animations draw the user's attention to the dashboard when changes occur.

Todos
=====
timeSeries is a class with a high potential for more features. This has to be done very carefully: performance is a critical issue here, transition animations quickly drive the browser to its limits.
Another class showing a timeline with trigger status and item values is planned. This will help to analyze sequences of incidents when cause and effects are not obvious at first sight.
