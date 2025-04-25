This folder contains custom modules that are used in Glue jobs. Here we already created a custom module called `src`.

Follow this guide by AWS to create custom modules to upload to Glue jobs.

[https://docs.aws.amazon.com/glue/latest/dg/add-job-python.html#create-python-extra-library](https://docs.aws.amazon.com/glue/latest/dg/add-job-python.html#create-python-extra-library)

Highly recommend to upload a `.whl` file. For example you can find the a file we created under `cdk/glue/custom_modules/src/dist/src-0.1-py3-none-any.whl`.